// i18n 类型定义（独立文件，避免循环引用）

// 翻译 key 定义
export type TKey =
    // 导航
    | 'nav.modelNexus' | 'nav.skillBrowser' | 'nav.appManager'
    | 'nav.localServer' | 'nav.logsDebug'
    // 页面标题
    | 'page.modelNexus' | 'page.skillBrowser' | 'page.appManager'
    | 'page.localServer' | 'page.logsDebug'
    // 设置
    | 'settings.title' | 'settings.version' | 'settings.language'
    | 'settings.logsDebug' | 'settings.updates'
    | 'settings.checkForUpdates' | 'settings.checking'
    | 'settings.latestVersion' | 'settings.checkFailed'
    // 按钮
    | 'btn.addModel' | 'btn.apply' | 'btn.scanAgain' | 'btn.refresh'
    | 'btn.save' | 'btn.cancel' | 'btn.delete' | 'btn.edit'
    | 'btn.install' | 'btn.uninstall' | 'btn.launchApp' | 'btn.loading'
    | 'btn.open' | 'btn.modifyOnly' | 'btn.start' | 'btn.stop'
    | 'btn.add' | 'btn.remove' | 'btn.saveModel' | 'btn.compute'
    | 'btn.sendLogs'
    // 状态
    | 'status.running' | 'status.offline' | 'status.installed'
    | 'status.notInstalled' | 'status.scanning' | 'status.paused'
    // 搜索
    | 'search.skills'
    // 模型弹窗
    | 'model.name' | 'model.apiKey' | 'model.modelId'
    | 'model.openaiUrl' | 'model.anthropicUrl' | 'model.proxyNode'
    | 'model.editConfig' | 'model.proxyTunnel' | 'model.specificProxy'
    | 'model.deleteTitle' | 'model.deleteConfirm'
    | 'model.selectToTest' | 'model.escCancel' | 'model.enterSave'
    // 技能
    | 'skills.details' | 'skills.selectToView'
    | 'skills.author' | 'skills.category' | 'skills.description'
    | 'skills.noDescription' | 'skills.noSkillsInCategory'
    | 'skills.catAll' | 'skills.catDevelopment' | 'skills.catMarketing'
    | 'skills.catDesign' | 'skills.catResearch' | 'skills.catAIML' | 'skills.catFinance'
    // 应用管理
    | 'agent.myLocalModel' | 'agent.selectTool' | 'agent.selectModelFor'
    | 'agent.installedSkillsFor' | 'agent.noSkills'
    | 'agent.applyAndLaunch' | 'agent.appliedVia'
    // 本地服务器
    | 'server.selectModel' | 'server.context' | 'server.port'
    | 'server.removeDirectories' | 'server.removeDirectoryConfirm'
    | 'server.compute' | 'server.stdout'
    | 'server.selectFromPanel' | 'server.awaitingInit' | 'server.selectConfigStart'
    | 'server.local' | 'server.store'
    | 'server.selectModelDir' | 'server.downloadFromStore'
    // 调试
    | 'debug.console' | 'debug.selectModelForAI' | 'debug.selectModelHint'
    | 'debug.sendLogsToAI' | 'debug.selectModelFirst'
    // 下载 / 模型商店
    | 'download.location' | 'download.changePath' | 'download.selectNewDir'
    | 'quant.light' | 'quant.standard' | 'quant.extended' | 'quant.large' | 'quant.maximum'
    // 工具分类（Agent Worker 页面）
    | 'toolCat.all' | 'toolCat.agentOS' | 'toolCat.ide' | 'toolCat.cli'
    | 'toolCat.autoTrading' | 'toolCat.game' | 'toolCat.utility'
    // Agent Worker 标签
    | 'agent.modelsTab' | 'agent.skillsTab'
    // ToolCard 标签
    | 'tool.models' | 'tool.skills' | 'tool.skillsInstalled'
    | 'tool.app' | 'tool.config'
    // Skills 额外
    | 'skills.viewGithub' | 'skills.loading'
    // VRAM 适配标签
    | 'vram.easy' | 'vram.good' | 'vram.tight' | 'vram.heavy'
    // 下载状态
    | 'status.complete' | 'status.failed'
    | 'download.inQueue' | 'download.pause' | 'download.resume'
    | 'download.cancel' | 'download.retry'
    // 日志页面
    | 'log.systemLog' | 'log.entries' | 'log.clear'
    // 调试控制台
    | 'debug.ready' | 'debug.analyzing' | 'debug.idle' | 'debug.errors'
    // 本地服务器
    | 'server.gpuFull' | 'server.cpuOnly'
    | 'server.setupEngine' | 'server.downloading' | 'server.installing'
    // ModelStore 按钮
    | 'store.add' | 'store.del' | 'store.cancel' | 'store.remove'
    | 'store.ver' | 'store.ready'
    // ModelCard 标签
    | 'model.label' | 'model.source' | 'model.latency' | 'model.debugTesting'
    | 'model.cloud' | 'model.local' | 'model.tunnel'
    // 复制按钮
    | 'btn.copy' | 'btn.copied'
    // 通用
    | 'common.noData' | 'common.confirm' | 'common.website'
    | 'common.areYouSure'
    // 关闭行为确认
    | 'close.title' | 'close.message' | 'close.minimize' | 'close.quit' | 'close.remember'
    // 关闭行为设置
    | 'settings.closeBehavior' | 'settings.closeAsk' | 'settings.closeMinimize' | 'settings.closeQuit'
    | 'btn.select'
    // API Key 加密状态提示
    | 'key.encrypted' | 'key.destroyed'
    // 开发者邀请提示
    | 'hint.devInvite';

export type Translations = Record<TKey, string>;
