// What each kind of record holds. Forms, lists and the search are generated from this,
// so a field added here appears everywhere at once.

// [key, label, tone]. Tones: idle, info, work, review, good, warn, bad
export const TASK_STATUS = [['todo', 'للتنفيذ', 'idle'], ['doing', 'قيد التنفيذ', 'work'], ['review', 'للمراجعة', 'review'], ['done', 'تم', 'good']];
export const PRIORITY = [['low', 'منخفضة', 'idle'], ['normal', 'عادية', 'info'], ['high', 'مهمة', 'warn'], ['urgent', 'عاجلة', 'bad']];
export const DEAL_STAGES = [
  ['lead', 'فرصة جديدة', 'idle'], ['contacted', 'تم التواصل', 'info'], ['meeting', 'اجتماع', 'work'],
  ['proposal', 'عرض سعر', 'review'], ['negotiation', 'تفاوض', 'warn'], ['won', 'تم التعاقد', 'good'], ['lost', 'لم تكتمل', 'bad'],
];
export const PROJECT_STAGES = [
  ['kickoff', 'الانطلاق', 'idle'], ['discovery', 'التحليل', 'info'], ['design', 'التصميم', 'work'], ['build', 'التنفيذ', 'work'],
  ['review', 'المراجعة والتسليم', 'review'], ['support', 'الدعم بعد التسليم', 'good'], ['closed', 'مغلق', 'idle'],
];
export const QUOTE_STATUS = [['draft', 'مسودة', 'idle'], ['review', 'بانتظار الاعتماد', 'review'], ['approved', 'معتمد وجاهز للإرسال', 'work'], ['sent', 'أرسل للعميل', 'info'], ['accepted', 'تم القبول', 'good'], ['rejected', 'لم يقبل', 'bad']];
export const INVOICE_STATUS = [['draft', 'مسودة', 'idle'], ['issued', 'صدرت', 'info'], ['paid', 'تم الدفع', 'good'], ['cancelled', 'ملغاة', 'idle']];
export const SETUP_STATUS = [['todo', 'لم يبدأ', 'idle'], ['doing', 'جار العمل', 'work'], ['waiting', 'بانتظار جهة', 'warn'], ['done', 'تم', 'good']];
export const POST_STATUS = [
  ['idea', 'فكرة', 'idle'], ['writing', 'كتابة', 'info'], ['design', 'تصميم', 'work'], ['review', 'مراجعة', 'review'],
  ['scheduled', 'مجدول', 'warn'], ['published', 'منشور', 'good'],
];
export const POST_FORMATS = [
  ['carousel', 'منشور متعدد الصور'], ['reel', 'فيديو قصير'], ['image', 'تصميم واحد'], ['video', 'فيديو'], ['thread', 'سلسلة'],
  ['story', 'قصة'], ['article', 'مقال'], ['text', 'نص'], ['poll', 'تصويت'], ['live', 'بث مباشر'],
];
export const ACCOUNT_STATUS = [['planned', 'لم يحجز بعد', 'idle'], ['reserved', 'الاسم محجوز', 'info'], ['active', 'مفعل', 'work'], ['verified', 'مكتمل وموثق', 'good']];
export const DECISION_STATUS = [['proposed', 'مقترح', 'review'], ['approved', 'معتمد', 'good'], ['rejected', 'مرفوض', 'bad'], ['superseded', 'ألغاه قرار لاحق', 'idle']];
export const KNOWLEDGE_KINDS = [
  ['note', 'معلومة'], ['lesson', 'درس مستفاد'], ['client', 'عن عميل'], ['brief', 'موجز عميل'], ['playbook', 'إجراء عمل'], ['link', 'مرجع'],
];
export const CLASSIFICATION = [['c1', 'داخلي', 'info'], ['c2', 'سري', 'warn']];
export const SKILL_STATUS = [['active', 'تعمل الآن', 'good'], ['draft', 'مسودة', 'review'], ['planned', 'في الخطة', 'idle']];
export const RISK = [['t0', 'T0 قراءة وتحليل'], ['t1', 'T1 مسودة داخلية'], ['t2', 'T2 يصل لعميل أو جمهور'], ['t3', 'T3 فعل خارجي']];
export const EXPENSE_CATS = [
  ['tools', 'اشتراكات وأدوات'], ['hosting', 'استضافة ونطاقات'], ['marketing', 'تسويق وإعلانات'], ['gov', 'رسوم حكومية'],
  ['office', 'المكتب'], ['people', 'رواتب ومكافآت'], ['other', 'أخرى'],
];
export const SETUP_GROUPS = [
  ['legal', 'السجل والكيان النظامي'], ['tax', 'الزكاة والضريبة'], ['people', 'التوظيف والتأمينات'], ['office', 'المقر والعنوان'],
  ['bank', 'البنك والمدفوعات'], ['digital', 'الحضور الرقمي'], ['brand', 'الهوية والعلامة'],
];
export const CLIENT_SOURCES = [['referral', 'ترشيح'], ['linkedin', 'لينكدإن'], ['x', 'إكس'], ['instagram', 'إنستغرام'], ['tiktok', 'تيك توك'], ['social', 'منصة تواصل أخرى'], ['whatsapp', 'واتساب'], ['website', 'الموقع'], ['event', 'فعالية أو معرض'], ['direct', 'تواصل مباشر'], ['parent', 'عن طريق الشركة الأم'], ['other', 'أخرى']];

export const label = (options, key) => (options.find(o => o[0] === key) || [key, key || ''])[1];
export const tone = (options, key) => (options.find(o => o[0] === key) || [])[2] || 'idle';

export const SCHEMA = {
  members: {
    fresh: 'عضو جديد', one: 'عضو', many: 'الفريق', module: 'team',
    fields: [
      { k: 'name', label: 'الاسم', type: 'text', req: true },
      { k: 'title', label: 'الدور في الشركة', type: 'text', ph: 'مثال: الشريك المسؤول عن الإبداع' },
      { k: 'role', label: 'الصلاحيات', type: 'role', def: 'role-partner' },
      { k: 'github', label: 'اسم المستخدم في GitHub', type: 'text', ph: 'لربط المزامنة بالعضو', dir: 'ltr' },
      { k: 'email', label: 'البريد', type: 'text', dir: 'ltr' },
      { k: 'phone', label: 'الجوال', type: 'text', dir: 'ltr' },
      { k: 'hours', label: 'ساعات العمل الأسبوعية', type: 'number', def: 40 },
      { k: 'tone', label: 'طريقة الكلام المفضلة معه', type: 'textarea', ph: 'مثال: الخلاصة أولا، ثم القرارات المطلوبة' },
    ],
  },
  tasks: {
    fresh: 'مهمة جديدة', one: 'مهمة', many: 'المهام', module: 'tasks',
    fields: [
      { k: 'title', label: 'المهمة', type: 'text', req: true, ph: 'فعل واضح ونتيجة، مثال: إرسال عرض السعر المعدل' },
      { k: 'status', label: 'الحالة', type: 'select', options: TASK_STATUS, def: 'todo' },
      { k: 'priority', label: 'الأولوية', type: 'select', options: PRIORITY, def: 'normal' },
      { k: 'assignees', label: 'المسؤول', type: 'members' },
      { k: 'due', label: 'الموعد', type: 'date' },
      { k: 'estimate', label: 'التقدير بالساعات', type: 'number' },
      { k: 'project', label: 'المشروع', type: 'project' },
      { k: 'client', label: 'العميل', type: 'client' },
      { k: 'checklist', label: 'الخطوات', type: 'checklist', wide: true },
      { k: 'notes', label: 'التفاصيل', type: 'textarea', wide: true },
    ],
  },
  clients: {
    fresh: 'عميل جديد', one: 'عميل', many: 'العملاء', module: 'clients',
    fields: [
      { k: 'name', label: 'اسم الجهة', type: 'text', req: true },
      { k: 'sector', label: 'القطاع', type: 'text', ph: 'مثال: تصنيع، تجزئة، خدمات' },
      { k: 'city', label: 'المدينة', type: 'text' },
      { k: 'contact', label: 'جهة الاتصال', type: 'text' },
      { k: 'phone', label: 'الجوال', type: 'text', dir: 'ltr' },
      { k: 'email', label: 'البريد', type: 'text', dir: 'ltr' },
      { k: 'website', label: 'الموقع', type: 'url' },
      { k: 'source', label: 'وصلنا عن طريق', type: 'select', options: CLIENT_SOURCES, def: 'direct' },
      { k: 'owner', label: 'المسؤول عن العلاقة', type: 'member' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
    ],
  },
  deals: {
    fresh: 'فرصة جديدة', one: 'فرصة', many: 'الفرص', module: 'clients',
    fields: [
      { k: 'title', label: 'الفرصة', type: 'text', req: true, ph: 'مثال: نظام حضور ورواتب لثلاثة فروع' },
      { k: 'client', label: 'العميل', type: 'client', req: true },
      { k: 'stage', label: 'المرحلة', type: 'select', options: DEAL_STAGES, def: 'lead' },
      { k: 'service', label: 'الخدمة', type: 'service' },
      { k: 'value', label: 'القيمة المتوقعة', type: 'money', money: true },
      { k: 'close', label: 'الإغلاق المتوقع', type: 'date' },
      { k: 'owner', label: 'المسؤول', type: 'member' },
      { k: 'next', label: 'الخطوة التالية', type: 'text', ph: 'ما الذي يحدث بعد ذلك ومتى' },
      { k: 'lostReason', label: 'سبب عدم الاكتمال', type: 'text', when: r => r.stage === 'lost' },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
    ],
  },
  projects: {
    fresh: 'مشروع جديد', one: 'مشروع', many: 'المشاريع', module: 'projects',
    fields: [
      { k: 'name', label: 'اسم المشروع', type: 'text', req: true },
      { k: 'client', label: 'العميل', type: 'client' },
      { k: 'stage', label: 'المرحلة', type: 'select', options: PROJECT_STAGES, def: 'kickoff' },
      { k: 'service', label: 'الخدمة', type: 'service' },
      { k: 'owner', label: 'مدير المشروع', type: 'member' },
      { k: 'team', label: 'الفريق', type: 'members' },
      { k: 'start', label: 'البداية', type: 'date' },
      { k: 'due', label: 'التسليم', type: 'date' },
      { k: 'budget', label: 'قيمة العقد', type: 'money', money: true },
      { k: 'health', label: 'الحالة العامة', type: 'select', options: [['ok', 'على المسار', 'good'], ['risk', 'يحتاج انتباه', 'warn'], ['late', 'متأخر', 'bad']], def: 'ok' },
      { k: 'blocker', label: 'ما الذي يعطلنا', type: 'text', ph: 'متوقف بسبب كذا، ونحتاج كذا من فلان' },
      { k: 'milestones', label: 'المراحل والتسليمات', type: 'checklist', dated: true, wide: true },
      { k: 'links', label: 'روابط العمل', type: 'textarea', ph: 'رابط في كل سطر: المستودع، ملفات التصميم، المجلد', wide: true },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
    ],
  },
  invoices: {
    fresh: 'مستند جديد', one: 'مستند', many: 'العروض والفواتير', module: 'finance',
    fields: [
      { k: 'kind', label: 'النوع', type: 'select', options: [['quote', 'عرض سعر'], ['invoice', 'فاتورة']], def: 'quote' },
      { k: 'number', label: 'الرقم', type: 'text', dir: 'ltr' },
      { k: 'client', label: 'العميل', type: 'client', req: true },
      { k: 'project', label: 'المشروع', type: 'project' },
      { k: 'status', label: 'الحالة', type: 'docstatus', def: 'draft' },
      { k: 'issue', label: 'التاريخ', type: 'date' },
      { k: 'dueDate', label: 'يستحق في', type: 'date' },
      { k: 'vat', label: 'ضريبة القيمة المضافة %', type: 'number', def: 15 },
      { k: 'items', label: 'البنود', type: 'items', wide: true },
      { k: 'terms', label: 'الشروط والملاحظات', type: 'textarea', wide: true },
    ],
  },
  expenses: {
    fresh: 'مصروف جديد', one: 'مصروف', many: 'المصروفات', module: 'finance',
    fields: [
      { k: 'title', label: 'البند', type: 'text', req: true },
      { k: 'amount', label: 'المبلغ', type: 'money', req: true, money: true },
      { k: 'date', label: 'التاريخ', type: 'date' },
      { k: 'category', label: 'التصنيف', type: 'select', options: EXPENSE_CATS, def: 'tools' },
      { k: 'vendor', label: 'الجهة', type: 'text' },
      { k: 'recurring', label: 'يتكرر شهريا', type: 'bool' },
      { k: 'paidBy', label: 'دفعه', type: 'member' },
      { k: 'receipt', label: 'رابط الإيصال', type: 'url' },
    ],
  },
  setup: {
    fresh: 'خطوة جديدة', one: 'خطوة', many: 'تأسيس الشركة', module: 'setup',
    fields: [
      { k: 'title', label: 'الخطوة', type: 'text', req: true },
      { k: 'group', label: 'المحور', type: 'select', options: SETUP_GROUPS, def: 'legal' },
      { k: 'status', label: 'الحالة', type: 'select', options: SETUP_STATUS, def: 'todo' },
      { k: 'owner', label: 'المسؤول', type: 'member' },
      { k: 'due', label: 'الموعد', type: 'date' },
      { k: 'portal', label: 'الجهة أو المنصة', type: 'text' },
      { k: 'url', label: 'رابط المنصة', type: 'url' },
      { k: 'why', label: 'لماذا نحتاجها', type: 'textarea', wide: true },
      { k: 'notes', label: 'ملاحظات ومتابعة', type: 'textarea', wide: true },
    ],
  },
  posts: {
    fresh: 'منشور جديد', one: 'منشور', many: 'المحتوى', module: 'content',
    fields: [
      { k: 'title', label: 'الفكرة أو العنوان', type: 'text', req: true },
      { k: 'status', label: 'الحالة', type: 'select', options: POST_STATUS, def: 'idea' },
      { k: 'date', label: 'تاريخ النشر', type: 'date' },
      { k: 'time', label: 'الوقت', type: 'time' },
      { k: 'platforms', label: 'المنصات', type: 'platforms' },
      { k: 'format', label: 'الشكل', type: 'select', options: POST_FORMATS, def: 'image' },
      { k: 'pillar', label: 'محور المحتوى', type: 'pillar' },
      { k: 'owner', label: 'المسؤول', type: 'member' },
      { k: 'caption', label: 'النص', type: 'caption', wide: true },
      { k: 'visual', label: 'توجيه التصميم', type: 'textarea', wide: true },
      { k: 'cta', label: 'الدعوة لإجراء', type: 'text', wide: true },
      { k: 'hashtags', label: 'الوسوم', type: 'tags', wide: true },
      { k: 'design', label: 'رابط التصميم', type: 'url' },
      { k: 'needsApproval', label: 'يحتاج اعتماد قبل النشر', type: 'bool', def: true },
      { k: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
    ],
  },
  accounts: {
    fresh: 'حساب جديد', one: 'حساب', many: 'حسابات المنصات', module: 'accounts',
    fields: [
      { k: 'platform', label: 'المنصة', type: 'platform', req: true },
      { k: 'handle', label: 'اسم الحساب', type: 'text', dir: 'ltr', ph: '@tamm' },
      { k: 'status', label: 'الحالة', type: 'select', options: ACCOUNT_STATUS, def: 'planned' },
      { k: 'url', label: 'رابط الحساب', type: 'url' },
      { k: 'owner', label: 'المسؤول', type: 'member' },
      { k: 'twoFactor', label: 'التحقق بخطوتين مفعل', type: 'bool' },
      { k: 'admins', label: 'من يملك صلاحية المدير', type: 'text', ph: 'الأسماء فقط، بدون كلمات مرور' },
      { k: 'steps', label: 'خطوات الإنشاء', type: 'checklist', wide: true },
      { k: 'specs', label: 'المقاسات والحدود', type: 'textarea', wide: true },
      { k: 'helpUrl', label: 'صفحة المساعدة الرسمية', type: 'url' },
    ],
  },
  knowledge: {
    fresh: 'معلومة جديدة', one: 'معلومة', many: 'المعرفة', module: 'knowledge',
    fields: [
      { k: 'title', label: 'العنوان', type: 'text', req: true, ph: 'اكتبه كسؤال سيبحث عنه أحد لاحقا' },
      { k: 'kind', label: 'النوع', type: 'select', options: KNOWLEDGE_KINDS, def: 'note' },
      { k: 'class', label: 'التصنيف', type: 'select', options: CLASSIFICATION, def: 'c1' },
      { k: 'client', label: 'العميل', type: 'client' },
      { k: 'body', label: 'المحتوى', type: 'textarea', rows: 10, wide: true },
      { k: 'source', label: 'المصدر', type: 'text', ph: 'من قالها، أو الملف، أو الرابط', wide: true },
      { k: 'related', label: 'مرتبط بـ', type: 'text', wide: true },
      { k: 'tags', label: 'الوسوم', type: 'tags', wide: true },
    ],
  },
  decisions: {
    fresh: 'قرار جديد', one: 'قرار', many: 'القرارات', module: 'decisions',
    fields: [
      { k: 'title', label: 'عنوان القرار', type: 'text', req: true },
      { k: 'decision', label: 'القرار', type: 'textarea', req: true, ph: 'صياغة قابلة للتنفيذ، مثال: نعتمد التصميم الثاني بجولة تحسين واحدة', wide: true },
      { k: 'status', label: 'الحالة', type: 'select', options: DECISION_STATUS, def: 'proposed' },
      { k: 'owner', label: 'المالك', type: 'member', req: true },
      { k: 'date', label: 'التاريخ', type: 'date' },
      { k: 'review', label: 'يراجع في', type: 'text', ph: 'تاريخ، أو: نهائي' },
      { k: 'context', label: 'السياق', type: 'textarea', wide: true },
      { k: 'rejected', label: 'البدائل المرفوضة ولماذا', type: 'textarea', wide: true },
      { k: 'affects', label: 'يتأثر به', type: 'text', wide: true },
    ],
  },
  meetings: {
    fresh: 'اجتماع جديد', one: 'اجتماع', many: 'الاجتماعات', module: 'meetings',
    fields: [
      { k: 'title', label: 'الموضوع', type: 'text', req: true },
      { k: 'date', label: 'التاريخ', type: 'date' },
      { k: 'time', label: 'الوقت', type: 'time' },
      { k: 'attendees', label: 'الحضور', type: 'members' },
      { k: 'client', label: 'العميل', type: 'client' },
      { k: 'summary', label: 'الخلاصة في خمسة أسطر', type: 'textarea', wide: true },
      { k: 'decisionsText', label: 'القرارات', type: 'textarea', ph: 'قرار في كل سطر', wide: true },
      { k: 'actions', label: 'المهام', type: 'actions', wide: true },
      { k: 'info', label: 'معلومات مهمة', type: 'textarea', wide: true },
      { k: 'open', label: 'معلق يحتاج حسما', type: 'textarea', wide: true },
    ],
  },
  skills: {
    fresh: 'مهارة جديدة', one: 'مهارة', many: 'المهارات', module: 'skills',
    fields: [
      { k: 'name', label: 'الاسم', type: 'text', req: true },
      { k: 'key', label: 'المعرف', type: 'text', dir: 'ltr', ph: 'nawah-...' },
      { k: 'status', label: 'الحالة', type: 'select', options: SKILL_STATUS, def: 'draft' },
      { k: 'risk', label: 'درجة الخطورة', type: 'select', options: RISK, def: 't1' },
      { k: 'trigger', label: 'تنادى بـ', type: 'text', ph: 'العبارات التي يقولها الفريق فعلا' },
      { k: 'does', label: 'ماذا تفعل', type: 'textarea', wide: true },
      { k: 'output', label: 'المخرج', type: 'text', wide: true },
      { k: 'steps', label: 'الخطوات', type: 'checklist', wide: true },
      { k: 'guardrails', label: 'حدودها', type: 'textarea', wide: true },
      { k: 'owner', label: 'صاحبها', type: 'member' },
    ],
  },
};

export const fieldsOf = col => SCHEMA[col]?.fields || [];
