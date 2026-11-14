#!/usr/bin/env python3
"""
Nawah Telegram copier.

Reads channels you follow with your own Telegram account and copies or forwards their posts, the
moment they appear, into a private channel of yours where the Nawah bot is an administrator. The
dashboard then receives everything round the clock, with the original channel and time intact.

    python copier.py list          show your channels and groups with their numeric ids
    python copier.py test          send a test message to every target channel
    python copier.py run           start copying (the first run asks for your phone and code)

Settings live in config.json next to this file (start from config.example.json).
"""
import argparse
import asyncio
import json
import re
import sys
import time
from pathlib import Path

try:
    from telethon import TelegramClient, events, errors, utils
except ImportError:
    sys.exit("Telethon is not installed. Run: pip install -r requirements.txt")

HERE = Path(__file__).resolve().parent
MAP_FILE = HERE / "map.json"
MAP_KEEP = 20000
DELETE_NOTICE = "حذف المصدر هذه الرسالة"

LINK = re.compile(r"https?://\S+|(?:t|telegram)\.me/\S+", re.I)
MENTION = re.compile(r"(^|\s)@[\w_]{3,}")
PROMO = re.compile(r"(join|subscribe|vip|wa\.me|whatsapp|اشترك|انضم|للاشتراك)", re.I)
SIGNAL_HINT = re.compile(r"(buy|sell|call|put|long|short|\btp\d?\b|\bsl\b|stop|target|شراء|بيع|صعود|هبوط|هدف|الهدف|وقف|ستوب|تارجت|win|loss|ربح|خسار)", re.I)


def log(*parts):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *parts, flush=True)


def load_config(path):
    p = Path(path)
    if not p.exists():
        sys.exit(f"{p.name} not found. Copy config.example.json to config.json and fill it in.")
    cfg = json.loads(p.read_text(encoding="utf-8"))
    for key in ("api_id", "api_hash", "routes"):
        if not cfg.get(key):
            sys.exit(f"config: '{key}' is missing")
    return cfg


class MessageMap:
    """Source message -> copies in each target, to keep reply chains and follow edits."""

    def __init__(self, path):
        self.path = path
        self.data = {}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                self.data = {}
        self.dirty = False

    def get(self, src, msg_id):
        """Copies of one source message: {target id: (copy id, how it was sent)}."""
        out = {}
        for dst, v in self.data.get(f"{src}:{msg_id}", {}).items():
            out[dst] = (v[0], v[1]) if isinstance(v, list) else (v, "forward")
        return out

    def put(self, src, msg_id, dst, dst_id, how):
        key = f"{src}:{msg_id}"
        self.data.setdefault(key, {})[str(dst)] = [dst_id, how]
        self.dirty = True

    def save(self):
        if not self.dirty:
            return
        if len(self.data) > MAP_KEEP:
            for k in list(self.data)[: len(self.data) - MAP_KEEP]:
                del self.data[k]
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data), encoding="utf-8")
        tmp.replace(self.path)
        self.dirty = False


def clean(text, route):
    """Removes links, mentions and invitation lines when asked, then adds the footer."""
    text = text or ""
    if route.get("strip_links", True):
        lines = [ln for ln in text.splitlines() if not PROMO.search(ln)]
        text = "\n".join(MENTION.sub(r"\1", LINK.sub("", ln)).strip() for ln in lines)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
    footer = (route.get("footer") or "").strip()
    return f"{text}\n\n{footer}".strip() if footer else text


class Copier:
    def __init__(self, cfg):
        self.cfg = cfg
        self.client = TelegramClient(str(HERE / cfg.get("session", "nawah-copier")), int(cfg["api_id"]), cfg["api_hash"])
        self.map = MessageMap(MAP_FILE)
        self.routes = []
        self.last_sent = {}
        self.lock = asyncio.Lock()

    async def resolve(self):
        # loading the chat list once lets numeric ids resolve on a fresh start
        await self.client.get_dialogs()
        for r in self.cfg["routes"]:
            src_ids, names, dsts = [], {}, []
            for x in r.get("from", []):
                ent = await self.client.get_entity(x)
                pid = utils.get_peer_id(ent)
                src_ids.append(pid)
                names[pid] = getattr(ent, "title", None) or getattr(ent, "username", None) or str(pid)
            for x in r.get("to", []):
                dsts.append(await self.client.get_entity(x))
            if not src_ids or not dsts:
                log("route skipped: it needs at least one source and one target")
                continue
            self.routes.append({**r, "src_ids": src_ids, "names": names, "dsts": dsts})
            log("route:", ", ".join(names.values()), "->", ", ".join(getattr(d, "title", str(d.id)) for d in dsts), f"({r.get('mode', 'forward')})")
        if not self.routes:
            sys.exit("No usable route. Check the 'from' and 'to' lists in config.json.")

    def routes_for(self, chat_id):
        return [r for r in self.routes if chat_id in r["src_ids"]]

    async def pace(self, dst_id):
        # about 20 messages a minute per channel keeps clear of Telegram's flood limits
        async with self.lock:
            wait = 3.1 - (time.monotonic() - self.last_sent.get(dst_id, 0))
            if wait > 0:
                await asyncio.sleep(wait)
            self.last_sent[dst_id] = time.monotonic()

    async def call(self, fn, *args, **kwargs):
        for attempt in range(3):
            try:
                return await fn(*args, **kwargs)
            except errors.FloodWaitError as e:
                log(f"Telegram asks to wait {e.seconds} s")
                await asyncio.sleep(e.seconds + 1)
        return await fn(*args, **kwargs)

    def wanted(self, msg, route):
        text = msg.message or ""
        words = [w.lower() for w in route.get("skip_words", [])]
        if any(w and w in text.lower() for w in words) and not SIGNAL_HINT.search(text):
            return False
        if route.get("only_signals") and not SIGNAL_HINT.search(text):
            return False
        return True

    def compose(self, msg, route, how, src):
        """Text of a copy: cleaned as the route asks, with the source named in text mode."""
        text = clean(msg.message, route)
        if how == "text" and text:
            title = route["names"].get(src, "")
            text = f"المصدر: {title}\n{text}" if title else text
        return text

    async def send(self, msg, route, dst, src, reply_to=None):
        """Sends one message to one target. Returns the sent message and how it went out."""
        how = route.get("mode", "forward")
        await self.pace(dst.id)
        if how == "forward":
            try:
                return await self.call(self.client.forward_messages, dst, msg), "forward"
            except errors.ChatForwardsRestrictedError:
                # the channel forbids forwarding: send its text with the source named on top
                how = "text"
                log("source forbids forwarding, sending its text instead")
        has_file = bool(msg.photo or msg.document)
        if how == "copy":
            try:
                if not route.get("strip_links", True) and not route.get("footer"):
                    return await self.call(self.client.send_message, dst, msg, reply_to=reply_to), "copy"
                text = self.compose(msg, route, "copy", src)
                if not text and not has_file:
                    return None, how
                return await self.call(self.client.send_message, dst, text, file=msg.media if has_file else None, reply_to=reply_to, link_preview=False), "copy"
            except errors.ChatForwardsRestrictedError:
                how = "text"
                log("source forbids copying its media, sending its text instead")
        text = self.compose(msg, route, "text", src)
        if not text:
            return None, how
        return await self.call(self.client.send_message, dst, text, reply_to=reply_to, link_preview=False), "text"

    async def on_new(self, event):
        msg = event.message
        src = event.chat_id
        for route in self.routes_for(src):
            if not self.wanted(msg, route):
                continue
            for dst in route["dsts"]:
                reply_to = None
                if self.cfg.get("keep_replies", True) and msg.reply_to_msg_id:
                    parent = self.map.get(src, msg.reply_to_msg_id).get(str(dst.id))
                    reply_to = parent[0] if parent else None
                try:
                    sent, how = await self.send(msg, route, dst, src, reply_to)
                except Exception as e:  # noqa: BLE001 - one failure must not stop the copier
                    log("send failed:", type(e).__name__, e)
                    continue
                if sent:
                    self.map.put(src, msg.id, dst.id, sent.id, how)
                    log("copied", src, msg.id, "->", dst.id, sent.id, f"({how})")
        self.map.save()

    async def on_edit(self, event):
        msg = event.message
        src = event.chat_id
        copies = self.map.get(src, msg.id)
        if not copies:
            return
        for route in self.routes_for(src):
            for dst in route["dsts"]:
                entry = copies.get(str(dst.id))
                if not entry:
                    continue
                old, how = entry
                try:
                    if how == "forward":
                        # a forward cannot be edited: forward the new version and remove the old one,
                        # so the dashboard sees the same original message with a different text
                        sent, how2 = await self.send(msg, route, dst, src)
                        if sent:
                            await self.call(self.client.delete_messages, dst, old)
                            self.map.put(src, msg.id, dst.id, sent.id, how2)
                    else:
                        text = self.compose(msg, route, how, src)
                        if text:
                            await self.pace(dst.id)
                            await self.call(self.client.edit_message, dst, old, text, link_preview=False)
                    log("edit followed", src, msg.id, "->", dst.id)
                except errors.MessageNotModifiedError:
                    pass
                except Exception as e:  # noqa: BLE001
                    log("edit failed:", type(e).__name__, e)
        self.map.save()

    async def on_delete(self, event):
        src = event.chat_id
        if src is None or not self.routes_for(src):
            return
        for msg_id in event.deleted_ids:
            for dst_id, (copy_id, _how) in self.map.get(src, msg_id).items():
                try:
                    dst = await self.client.get_entity(int(dst_id))
                    await self.pace(dst.id)
                    await self.call(self.client.send_message, dst, DELETE_NOTICE, reply_to=copy_id)
                    log("delete noted", src, msg_id)
                except Exception as e:  # noqa: BLE001
                    log("delete notice failed:", type(e).__name__, e)

    async def run(self):
        await self.client.start()
        me = await self.client.get_me()
        log("signed in as", me.first_name or "", f"@{me.username}" if me.username else "")
        await self.resolve()
        sources = sorted({s for r in self.routes for s in r["src_ids"]})
        self.client.add_event_handler(self.on_new, events.NewMessage(chats=sources))
        if self.cfg.get("propagate_edits", True):
            self.client.add_event_handler(self.on_edit, events.MessageEdited(chats=sources))
        if self.cfg.get("notify_deletes", True):
            self.client.add_event_handler(self.on_delete, events.MessageDeleted())
        log("copier running. Press Ctrl+C to stop.")
        await self.client.run_until_disconnected()


async def run_copier(cfg):
    # the client is created inside the running loop, as Telethon expects with asyncio.run
    await Copier(cfg).run()


async def list_chats(cfg):
    client = TelegramClient(str(HERE / cfg.get("session", "nawah-copier")), int(cfg["api_id"]), cfg["api_hash"])
    await client.start()
    async for d in client.iter_dialogs():
        if d.is_channel or d.is_group:
            uname = getattr(d.entity, "username", None)
            kind = "channel" if d.is_channel and not d.is_group else "group"
            print(f"{d.id}\t{kind}\t{d.name}\t{'@' + uname if uname else ''}")
    await client.disconnect()


async def test(cfg):
    c = Copier(cfg)
    await c.client.start()
    await c.resolve()
    for r in c.routes:
        for dst in r["dsts"]:
            await c.client.send_message(dst, "رسالة اختبار من برنامج النسخ: الوصول إلى هذه القناة يعمل.")
            log("test sent to", getattr(dst, "title", dst.id))
    await c.client.disconnect()


def main():
    ap = argparse.ArgumentParser(description="Copy Telegram channels into your own channel for Nawah.")
    ap.add_argument("command", choices=["run", "list", "test"])
    ap.add_argument("--config", default=str(HERE / "config.json"))
    args = ap.parse_args()
    cfg = load_config(args.config)
    try:
        if args.command == "list":
            asyncio.run(list_chats(cfg))
        elif args.command == "test":
            asyncio.run(test(cfg))
        else:
            asyncio.run(run_copier(cfg))
    except KeyboardInterrupt:
        log("stopped")


if __name__ == "__main__":
    main()
