// Fictional data for the demo copy only. Every name here is invented.
import { addDays, today, weekStart, parseDay } from './core/util.js';
import { BUILTIN_ROLES } from './core/perms.js';
import { DEFAULT_SETTINGS, SETUP_TEMPLATE, NAWAH_SKILLS } from './seed.js';

export function buildDemo(store) {
  const t = today();
  // Friday is protected in the Nawah rules and Saturday is off: nothing lands on either
  const d = n => { const x = addDays(t, n); const g = parseDay(x).getDay(); return g === 5 ? addDays(x, -1) : g === 6 ? addDays(x, 1) : x; };
  const aged = (col, rec, days) => {
    const r = store.put(col, rec, { log: false, quiet: true });
    const at = Date.now() - days * 86400000;
    store.data[col].set(r.id, { ...r, createdAt: at, updatedAt: at });
    return r;
  };
  for (const r of BUILTIN_ROLES) store.put('roles', structuredClone(r), { log: false, quiet: true });
  for (const [id, v] of Object.entries(DEFAULT_SETTINGS)) store.put('settings', { ...structuredClone(v), id }, { log: false, quiet: true });
  store.saveSetting('company', { ...DEFAULT_SETTINGS.company, name: 'شركة تجريبية للحلول التقنية', nameEn: 'Demo Tech', parent: '', city: 'الرياض' });
  store.saveSetting('numbering', { quote: 'DEMO-Q', invoice: 'DEMO-INV', next: {} });
  for (const s of NAWAH_SKILLS) store.put('skills', structuredClone(s), { log: false, quiet: true });

  const m1 = store.put('members', { id: 'dm-1', name: 'ريم الحربي', title: 'شريكة، الإبداع والتجربة', role: 'role-partner', hours: 40 }, { log: false, quiet: true });
  store.me = m1;
  const m2 = store.put('members', { id: 'dm-2', name: 'فهد العتيبي', title: 'شريك، التقنية والمشاريع', role: 'role-partner', hours: 40 }, { log: false, quiet: true });
  const m3 = store.put('members', { id: 'dm-3', name: 'نورة القحطاني', title: 'مسؤولة المحتوى', role: 'role-content', hours: 32 }, { log: false, quiet: true });
  const A = m1.id; const B = m2.id; const C = m3.id;

  const statuses = ['done', 'done', 'doing', 'doing', 'todo', 'waiting', 'todo'];
  SETUP_TEMPLATE.forEach((s, i) => store.put('setup', { ...s, status: statuses[i % statuses.length], owner: i % 2 ? B : A, due: i < 8 ? d(i * 3 - 6) : '' }, { log: false, quiet: true }));

  const cl = [
    ['dc-1', 'مصنع الريان للأثاث', 'تصنيع', 'الرياض', 'referral'],
    ['dc-2', 'عيادات سما', 'رعاية صحية', 'جدة', 'social'],
    ['dc-3', 'مدارس الأفق الأهلية', 'تعليم', 'الدمام', 'direct'],
    ['dc-4', 'شركة دروب للنقل', 'نقل وخدمات', 'الرياض', 'whatsapp'],
    ['dc-5', 'متاجر الواحة', 'تجزئة', 'القصيم', 'event'],
  ];
  for (const [id, name, sector, city, source] of cl) store.put('clients', { id, name, sector, city, source, owner: id === 'dc-2' ? B : A, contact: 'مدير العمليات' }, { log: false, quiet: true });

  const deals = [
    ['dd-1', 'نظام حضور ورواتب لثلاثة فروع', 'dc-1', 'proposal', 85000, d(12), B, 'إرسال العرض المعدل بعد اجتماع الثلاثاء'],
    ['dd-2', 'موقع وحجز مواعيد', 'dc-2', 'meeting', 46000, d(20), A, 'جلسة استكشاف مع الإدارة'],
    ['dd-3', 'بوابة أولياء الأمور', 'dc-3', 'contacted', 120000, d(35), B, 'تحديد موعد عرض تقديمي'],
    ['dd-4', 'ربط واتساب الشركة بالطلبات', 'dc-4', 'negotiation', 38000, d(6), A, 'مراجعة شروط الدفع'],
    ['dd-5', 'هوية بصرية ومتجر', 'dc-5', 'lead', 55000, d(40), A, 'أول اتصال'],
    ['dd-6', 'لوحة تشغيل الأسطول', 'dc-4', 'won', 64000, d(-10), B, ''],
  ];
  for (const [id, title, client, stage, value, close, owner, next] of deals) store.put('deals', { id, title, client, stage, value, close, owner, next, service: 'أنظمة إدارة الأعمال', ...(stage === 'won' ? { closedAt: d(-10) } : {}) }, { log: false, quiet: true });

  const ms = (list) => list.map(([tt, due, done]) => ({ t: tt, due: d(due), done }));
  store.put('projects', { id: 'dp-1', name: 'لوحة تشغيل الأسطول', client: 'dc-4', stage: 'build', owner: B, team: [A, B], start: d(-9), due: d(24), budget: 64000, health: 'ok', milestones: ms([['تحليل المتطلبات', -6, true], ['تصميم الواجهات', -1, true], ['ربط أجهزة التتبع', 8, false], ['تجربة مع الفريق', 16, false], ['التسليم والتدريب', 24, false]]) }, { log: false, quiet: true });
  store.put('projects', { id: 'dp-2', name: 'تحديث موقع مصنع الريان', client: 'dc-1', stage: 'design', owner: A, team: [A, C], start: d(-4), due: d(18), budget: 22000, health: 'risk', blocker: 'معطل بسبب صور المنتجات، نحتاجها من العميل قبل الخميس', milestones: ms([['خريطة الصفحات', -2, true], ['التصميم الأول', 4, false], ['المحتوى', 9, false], ['الإطلاق', 18, false]]) }, { log: false, quiet: true });
  store.put('projects', { id: 'dp-3', name: 'نظام المواعيد الداخلي', client: 'dc-2', stage: 'kickoff', owner: B, team: [B], start: d(2), due: d(50), budget: 0, health: 'ok', milestones: ms([['ورشة الاستكشاف', 3, false]]) }, { log: false, quiet: true });

  const tasks = [
    ['إرسال عرض السعر المعدل لمصنع الريان', B, 0, 'high', 'todo', 'dp-2'], ['مراجعة تصميم الصفحة الرئيسية', A, 0, 'normal', 'review', 'dp-2'],
    ['تجهيز بيانات تجربة التتبع', B, 2, 'normal', 'doing', 'dp-1'], ['كتابة منشور حالة الأسطول', C, -1, 'high', 'doing', ''],
    ['اعتماد قائمة الخدمات', A, 3, 'urgent', 'todo', ''], ['متابعة صور المنتجات مع العميل', A, 1, 'high', 'todo', 'dp-2'],
    ['تحديث قالب عرض السعر', B, 5, 'low', 'todo', ''], ['تصميم قالب الكاروسيل', C, 4, 'normal', 'todo', ''],
    ['حجز أسماء الحسابات', C, -2, 'high', 'todo', ''], ['اجتماع استكشاف عيادات سما', A, 6, 'normal', 'todo', ''],
    ['مراجعة عقد الإيجار', B, 9, 'normal', 'todo', ''], ['رفع ملفات الهوية للمستودع', A, -5, 'normal', 'done', ''],
  ];
  tasks.forEach(([title, who, due, priority, status, project], i) => store.put('tasks', { id: `dt-${i}`, title, assignees: [who], due: d(due), priority, status, project, estimate: [2, 3, 4, 6][i % 4], ...(status === 'done' ? { doneAt: Date.now() - 2 * 86400000 } : {}) }, { log: false, quiet: true }));

  store.saveSetting('content', { ...DEFAULT_SETTINGS.content, occasions: [{ date: d(25), label: 'مناسبة تجريبية', expected: false, idea: 'مثال على مناسبة في التقويم' }] });
  const pillars = ['proof', 'learn', 'inside', 'solutions', 'talk'];
  const postStatus = ['published', 'published', 'scheduled', 'review', 'design', 'writing', 'idea'];
  const titles = ['ثلاث علامات أن شركتك تحتاج نظاما واحدا', 'كيف نبني شاشة الحضور في الفرع', 'من داخل الفريق: يوم مراجعة', 'الفرق بين نظام جاهز ونظام مبني لك', 'سؤال الأسبوع: أين تضيع رسائل العملاء؟', 'قبل وبعد: تقرير يومي في دقيقة', 'لماذا نكتب العربية أولا', 'خمس خطوات لتنظيم واتساب الشركة', 'كيف نقيس نجاح المشروع', 'من المسودة إلى الاعتماد', 'دليل مختصر لتقارير المبيعات', 'لقطة من لوحة التشغيل'];
  titles.forEach((title, i) => {
    const off = i * 3 - 8;
    const st = off < -2 ? 'published' : postStatus[(i + 2) % postStatus.length] === 'published' ? 'scheduled' : postStatus[(i + 2) % postStatus.length];
    store.put('posts', { id: `dpo-${i}`, title, date: d(off), time: ['10:00', '20:30', '13:00'][i % 3], platforms: [['linkedin', 'x'], ['instagram', 'tiktok'], ['linkedin'], ['x', 'instagram', 'linkedin']][i % 4], format: ['carousel', 'reel', 'image', 'thread'][i % 4], pillar: pillars[i % pillars.length], status: st, owner: C, needsApproval: true, caption: 'نص تجريبي لهذا المنشور. في النسخة الحقيقية يكتب النص كاملا هنا ويراجع قبل الجدولة.', ...(st === 'published' ? { metrics: { reach: 1200 + i * 140, engagements: 60 + i * 9, clicks: 14 + i, leads: i % 3 } } : {}) }, { log: false, quiet: true });
  });
  for (const k of ['linkedin', 'x', 'instagram', 'whatsapp', 'tiktok']) store.put('accounts', { id: `acc-${k}`, platform: k, status: k === 'linkedin' ? 'active' : k === 'x' ? 'reserved' : 'planned', handle: k === 'linkedin' || k === 'x' ? '@demo_tech' : '', twoFactor: k === 'linkedin', owner: C, steps: ['احجز الاسم', 'أنشئ الحساب ببريد الشركة', 'فعل التحقق بخطوتين', 'أضف مديرا ثانيا', 'ارفع الشعار والغلاف'].map((s, i) => ({ t: s, done: k === 'linkedin' ? true : i < 1 })) }, { log: false, quiet: true });

  const items = [{ desc: 'تحليل وتصميم', qty: 1, price: 18000 }, { desc: 'تطوير النظام', qty: 1, price: 52000 }, { desc: 'تدريب الفريق', qty: 2, price: 2500 }];
  store.put('invoices', { id: 'di-1', kind: 'quote', number: 'DEMO-Q-2026-001', client: 'dc-1', status: 'review', issue: d(-1), dueDate: d(29), vat: 15, items, terms: 'الدفع على ثلاث دفعات. يشمل الضمان ستة أشهر.' }, { log: false, quiet: true });
  store.put('invoices', { id: 'di-2', kind: 'quote', number: 'DEMO-Q-2026-002', client: 'dc-4', status: 'accepted', issue: d(-14), vat: 15, items: [{ desc: 'لوحة تشغيل الأسطول', qty: 1, price: 64000 }] }, { log: false, quiet: true });
  store.put('invoices', { id: 'di-3', kind: 'invoice', number: 'DEMO-INV-2026-001', client: 'dc-4', status: 'paid', issue: d(-9), paidAt: d(-3), vat: 15, items: [{ desc: 'الدفعة الأولى، لوحة تشغيل الأسطول', qty: 1, price: 25600 }] }, { log: false, quiet: true });
  store.put('invoices', { id: 'di-4', kind: 'invoice', number: 'DEMO-INV-2026-002', client: 'dc-4', status: 'issued', issue: d(-20), dueDate: d(-6), vat: 15, items: [{ desc: 'دفعة مقدمة، ربط واتساب', qty: 1, price: 9500 }] }, { log: false, quiet: true });
  [['اشتراك أدوات التصميم', 340, 'tools', true], ['استضافة ونطاق', 210, 'hosting', true], ['رسوم حكومية', 1200, 'gov', false], ['إعلان تجريبي', 800, 'marketing', false]].forEach(([title, amount, category, recurring], i) => store.put('expenses', { id: `de-${i}`, title, amount, category, recurring, date: d(-i * 4), paidBy: i % 2 ? B : A }, { log: false, quiet: true }));

  aged('knowledge', { id: 'dk-1', title: 'ما الذي يفضله مصنع الريان في التواصل؟', kind: 'client', class: 'c2', client: 'dc-1', body: '- يفضل الاجتماعات صباح الأحد\n- القرار عند المدير العام بعد رأي المحاسب\n- يريد التقرير اليومي على الجوال', source: 'اجتماع الاستكشاف مع مدير العمليات' }, 5);
  aged('knowledge', { id: 'dk-2', title: 'لماذا تأخر تسليم التصميم الأول؟', kind: 'lesson', class: 'c1', body: 'بدأنا التصميم قبل استلام صور المنتجات.\n\n**القاعدة:** لا نبدأ التصميم قبل استلام المحتوى الأساسي من العميل.', source: 'وقفة الخميس' }, 12);
  aged('knowledge', { id: 'dk-3', title: 'كيف نسعر مشروع نظام داخلي؟', kind: 'playbook', class: 'c2', body: '1. موجز معتمد أولا\n2. تقدير الساعات لكل جزء مع هامش واقعية\n3. الأسعار من القائمة المعتمدة فقط', source: '' }, 21);

  store.put('decisions', { id: 'dx-1', number: `D-${d(-3).replace(/-/g, '')}-1`, title: 'العربية أولا في كل الواجهات', decision: 'نصمم كل واجهة بالعربية أولا ثم نضيف الإنجليزية.', status: 'approved', owner: A, date: d(-3), review: 'نهائي' }, { log: false, quiet: true });
  store.put('decisions', { id: 'dx-2', number: `D-${t.replace(/-/g, '')}-1`, title: 'أداة الجدولة للمحتوى', decision: 'نبدأ بأدوات الجدولة المجانية في المنصات نفسها لمدة شهر، ثم نقيس.', status: 'proposed', owner: C, date: t, context: 'نريد أقل كلفة في البداية.' }, { log: false, quiet: true });

  store.put('meetings', { id: 'dmt-1', title: 'استكشاف مصنع الريان', date: d(-6), time: '10:00', attendees: [A, B], client: 'dc-1', summary: 'المصنع يدير الحضور والرواتب في جداول منفصلة لكل فرع، ويريد نظاما واحدا وتقريرا يوميا على الجوال.', decisionsText: 'نرسل عرضا على ثلاث مراحل', actions: [{ t: 'إعداد عرض السعر', owner: B, due: d(-2), taskId: 'dt-0' }, { t: 'طلب نموذج تقرير الرواتب الحالي', owner: A, due: d(1) }] }, { log: false, quiet: true });
  store.put('weeks', { id: `wk-${weekStart(t)}`, start: weekStart(t), plans: { [A]: { priorities: [{ t: 'اعتماد قائمة الخدمات', output: 'قائمة نهائية في الإعدادات' }, { t: 'التصميم الأول لموقع الريان', output: 'ملف للمراجعة' }, { t: 'اجتماع عيادات سما', output: 'موجز عميل' }], notThis: 'تحديث الهوية الداخلية' }, [B]: { priorities: [{ t: 'إرسال عرض الريان', output: 'عرض معتمد ومرسل', done: true }, { t: 'ربط أجهزة التتبع', output: 'تجربة على سيارتين' }], notThis: '' } }, close: {} }, { log: false, quiet: true });

  // a little history so the activity feed and the log have something to show
  const hist = [[B, 'create', 'tasks', 'dt-0', 'إرسال عرض السعر المعدل لمصنع الريان', 26], [C, 'update', 'posts', 'dpo-3', 'الفرق بين نظام جاهز ونظام مبني لك', 9], [A, 'approve', 'decisions', 'dx-1', 'العربية أولا في كل الواجهات', 50], [B, 'create', 'deals', 'dd-4', 'ربط واتساب الشركة بالطلبات', 120], [C, 'create', 'posts', 'dpo-7', 'خمس خطوات لتنظيم واتساب الشركة', 200]];
  for (const [by, action, col, ref, label, minutes] of hist) {
    const at = Date.now() - minutes * 60000;
    store.data.log.set(`lg-demo-${ref}`, { id: `lg-demo-${ref}`, at, by, action, col, ref, label, createdAt: at, updatedAt: at });
  }
  store.markDirty('log');
  store.me = null;
}
