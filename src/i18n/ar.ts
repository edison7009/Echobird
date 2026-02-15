// الترجمة العربية
import { Translations } from './types';

const ar: Partial<Translations> = {
    'nav.modelNexus': 'مركز النماذج',
    'nav.skillBrowser': 'متصفح المهارات',
    'nav.appManager': 'إدارة التطبيقات',
    'nav.localServer': 'الخادم المحلي',
    'nav.logsDebug': 'السجلات والتصحيح',
    'page.modelNexus': 'مركز النماذج',
    'page.skillBrowser': 'متصفح المهارات',
    'page.appManager': 'إدارة التطبيقات',
    'page.localServer': 'الخادم المحلي',
    'page.logsDebug': 'السجلات والتصحيح',
    'settings.title': 'الإعدادات',
    'settings.version': 'الإصدار',
    'settings.language': 'اللغة',
    'settings.logsDebug': 'السجلات والتصحيح',
    'settings.updates': 'التحديثات',
    'settings.checkForUpdates': 'التحقق من التحديثات',
    'settings.checking': 'جارٍ التحقق…',
    'settings.latestVersion': 'لديك أحدث إصدار',
    'settings.checkFailed': 'فشل التحقق — إعادة المحاولة',
    'btn.addModel': 'إضافة نموذج',
    'btn.apply': 'تطبيق',
    'btn.scanAgain': 'إعادة الفحص',
    'btn.refresh': 'تحديث',
    'btn.save': 'حفظ',
    'btn.cancel': 'إلغاء',
    'btn.delete': 'حذف',
    'btn.edit': 'تعديل',
    'btn.install': 'تثبيت',
    'btn.uninstall': 'إلغاء التثبيت',
    'btn.launchApp': 'تشغيل التطبيق',
    'btn.loading': 'جارٍ التحميل…',
    'btn.open': 'فتح',
    'btn.modifyOnly': 'تعديل فقط',
    'btn.start': 'بدء',
    'btn.stop': 'إيقاف',
    'btn.add': 'إضافة',
    'btn.remove': 'إزالة',
    'btn.saveModel': 'حفظ النموذج',
    'btn.compute': 'حساب',
    'btn.sendLogs': 'إرسال السجلات للذكاء الاصطناعي',
    'status.running': 'قيد التشغيل',
    'status.offline': 'غير متصل',
    'status.installed': 'مثبّت',
    'status.notInstalled': 'غير مثبّت',
    'status.scanning': 'جارٍ الفحص…',
    'status.paused': 'متوقف مؤقتاً',
    'search.skills': 'البحث عن مهارات…',
    'model.name': 'الاسم',
    'model.apiKey': 'مفتاح API',
    'model.modelId': 'معرّف النموذج',
    'model.openaiUrl': 'عنوان OpenAI',
    'model.anthropicUrl': 'عنوان Anthropic',
    'model.proxyNode': 'عقدة الوكيل',
    'model.editConfig': 'تعديل إعدادات النموذج',
    'model.proxyTunnel': 'نفق الوكيل',
    'model.specificProxy': 'وكيل خاص بالنموذج',
    'model.deleteTitle': 'حذف النموذج',
    'model.deleteConfirm': 'سيتم حذف إعدادات هذا النموذج نهائياً. لا يمكن التراجع عن هذا الإجراء.',
    'model.selectToTest': 'اختر نموذجاً لبدء الاختبار',
    'model.escCancel': '[ESC] إلغاء',
    'model.enterSave': '[ENTER] حفظ',
    'skills.details': 'تفاصيل المهارة',
    'skills.selectToView': 'اختر مهارة لعرض التفاصيل',
    'skills.author': 'المؤلف',
    'skills.category': 'الفئة',
    'skills.description': 'الوصف',
    'skills.noDescription': 'لا يوجد وصف',
    'skills.noSkillsInCategory': 'لا توجد مهارات في هذه الفئة',
    'skills.catAll': 'الكل',
    'skills.catDevelopment': 'تطوير',
    'skills.catMarketing': 'تسويق',
    'skills.catDesign': 'تصميم',
    'skills.catResearch': 'بحث',
    'skills.catAIML': 'AI/ML',
    'skills.catFinance': 'مالية',
    'agent.myLocalModel': 'نموذجي المحلي',
    'agent.selectTool': 'اختر أداة للتهيئة',
    'agent.selectModelFor': 'اختر نموذجاً لـ',
    'agent.installedSkillsFor': 'المهارات المثبتة لـ',
    'agent.noSkills': 'لا توجد مهارات مثبتة',
    'agent.applyAndLaunch': 'تطبيق الإعدادات وتشغيل التطبيق',
    'agent.appliedVia': 'تم التطبيق عبر ملفات الإعدادات الرسمية',
    'server.selectModel': 'اختر النموذج:',
    'server.context': 'السياق',
    'server.port': 'المنفذ',
    'server.removeDirectories': 'إزالة المجلدات',
    'server.removeDirectoryConfirm': 'إزالة مجلد واحد من القائمة. لن يتم حذف الملفات المحلية.',
    'server.compute': 'حساب',
    'server.stdout': 'STDOUT',
    'server.selectFromPanel': 'اختر النموذج من اللوحة اليمنى',
    'server.awaitingInit': 'في انتظار تهيئة الخادم…',
    'server.selectConfigStart': 'اختر النموذج → تهيئة → بدء',
    'server.local': 'محلي',
    'server.store': 'المتجر',
    'server.selectModelDir': 'اختر مجلد النماذج',
    'server.downloadFromStore': 'تنزيل النماذج من المتجر',
    'debug.console': 'وحدة التصحيح',
    'debug.selectModelForAI': 'اختر نموذجاً لتحليل الذكاء الاصطناعي',
    'debug.selectModelHint': 'اختر نموذجاً لتفعيل تحليل السجلات بالذكاء الاصطناعي',
    'debug.sendLogsToAI': 'إرسال السجلات للذكاء الاصطناعي',
    'debug.selectModelFirst': 'اختر نموذجاً أولاً',
    'download.location': 'مسار التنزيل:',
    'download.changePath': 'تغيير مسار التنزيل',
    'download.selectNewDir': 'اختيار مجلد تنزيل افتراضي جديد؟',
    'quant.light': 'خفيف',
    'quant.standard': 'قياسي',
    'quant.extended': 'موسّع',
    'quant.large': 'كبير',
    'quant.maximum': 'أقصى',
    'model.label': 'نموذج',
    'model.source': 'المصدر',
    'model.latency': 'زمن الاستجابة',
    'model.debugTesting': 'اختبار التصحيح',
    'model.cloud': 'سحابي',
    'model.local': 'محلي',
    'model.tunnel': 'نفق',
    'btn.copy': '[نسخ]',
    'btn.copied': '[✓]',
    'common.noData': 'لا توجد بيانات',
    'common.confirm': 'تأكيد',
    'common.website': 'الموقع',
    'common.areYouSure': 'هل أنت متأكد؟',
    'btn.select': 'اختيار',
    'toolCat.all': 'الكل',
    'toolCat.agentOS': 'AgentOS',
    'toolCat.ide': 'IDE',
    'toolCat.cli': 'CLI',
    'toolCat.autoTrading': 'تداول آلي',
    'toolCat.game': 'لعبة',
    'toolCat.utility': 'أدوات',
    'agent.modelsTab': 'النماذج',
    'agent.skillsTab': 'المهارات',
    'tool.models': 'النماذج',
    'tool.skills': 'المهارات',
    'tool.skillsInstalled': 'مثبتة',
    'tool.app': 'التطبيق',
    'tool.config': 'الإعدادات',
    'skills.viewGithub': 'عرض GITHUB',
    'skills.loading': 'جارٍ تحميل المهارات…',
    'vram.easy': 'سهل',
    'vram.good': 'جيد',
    'vram.tight': 'ضيق',
    'vram.heavy': 'ثقيل',
    'status.complete': 'مكتمل',
    'status.failed': 'فشل',
    'download.inQueue': 'في الانتظار',
    'download.pause': 'إيقاف مؤقت',
    'download.resume': 'استئناف',
    'download.cancel': 'إلغاء',
    'download.retry': 'إعادة المحاولة',
    'log.systemLog': 'سجل النظام',
    'log.entries': 'سجلات',
    'log.clear': 'مسح',
    'debug.ready': '[SYS] وحدة التصحيح جاهزة',
    'debug.analyzing': '[EXEC] جارٍ التحليل…',
    'debug.idle': '_ جاهز',
    'debug.errors': 'أخطاء',
    'server.gpuFull': '⚡ GPU كامل',
    'server.cpuOnly': '🖥 CPU فقط',
    'server.setupEngine': 'إعداد المحرك',
    'server.downloading': 'جاري التحميل',
    'server.installing': 'جاري التثبيت…',
    'store.add': '[+إضافة]',
    'store.del': '[-حذف]',
    'store.cancel': '[إلغاء]',
    'store.remove': 'إزالة',
    'store.ver': 'إصدار',
    'store.ready': '✓ جاهز',
    'close.title': 'إغلاق النافذة',
    'close.message': 'هل تريد التصغير إلى شريط النظام أم الخروج بالكامل؟',
    'close.minimize': 'تصغير إلى شريط النظام',
    'close.quit': 'خروج',
    'close.remember': 'تذكر اختياري',
    'settings.closeBehavior': 'سلوك الإغلاق',
    'settings.closeAsk': 'السؤال في كل مرة',
    'settings.closeMinimize': 'تصغير إلى شريط النظام',
    'settings.closeQuit': 'الخروج بالكامل',
    // 开发者邀请提示
    // API Key encryption status hints
    'key.encrypted': 'مشفّر عالميًا — سيتم تدمير API Key ذاتيًا عند تغيير البيئة)',
    'key.destroyed': 'تم اكتشاف تغيير في البيئة — تم تدمير API Key ذاتيًا، يرجى إعادة الإدخال)',
    'hint.devInvite': 'طوّر تطبيقات أو ألعاب ذكاء اصطناعي — راجع \"Reversi\" و \"AI Translate\".',
};

export default ar;
