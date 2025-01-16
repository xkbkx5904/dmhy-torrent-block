// ==UserScript==
// @name:zh-CN   动漫花园种子屏蔽助手
// @name         DMHY Torrent Block
// @namespace    https://github.com/xkbkx5904
// @version      1.1.4
// @author       xkbkx5904
// @description  Enhanced version of DMHY Block script with more features: UI management, regex filtering, context menu, and ad blocking
// @description:zh-CN  增强版的动漫花园资源屏蔽工具，支持用户界面管理、正则表达式过滤、右键菜单和广告屏蔽等功能
// @homepage     https://github.com/xkbkx5904/dmhy-torrent-block
// @supportURL   https://github.com/xkbkx5904/dmhy-torrent-block/issues
// @match        *://share.dmhy.org/*
// @license      MIT
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @noframes
// @copyright    2025, xkbkx5904
// @originalAuthor tautcony
// @originalURL  https://greasyfork.org/zh-CN/scripts/36871-dmhy-block
// @icon         https://share.dmhy.org/favicon.ico
// ==/UserScript==

/*
更新日志：
v1.1.4
- 修复管理界面关闭时错误的未保存更改提示

v1.1.3
- 优化用户名显示和管理功能
- 改进用户ID输入规则提示
- 优化未完整删除的用户数据处理逻辑

v1.1.2
- 优化用户名显示和管理功能
- 改进用户ID输入规则提示
- 优化未完整删除的用户数据处理逻辑

v1.1.1
- 修复数字ID选择器的兼容性问题
- 优化广告屏蔽性能和时机
- 改进广告选择器的精确度
- 统一广告和PikPak按钮的处理逻辑

v1.1.0
- 初始版本发布
- 支持用户界面管理
- 支持正则表达式过滤
- 支持右键菜单
- 支持广告屏蔽
*/

/**
 * 全局配置对象
 */
const CONFIG = {
    // 存储相关配置
    storage: {
        blockListKey: 'dmhy_blocklist'
    },
    
    // DOM选择器配置
    selectors: {
        torrentList: "table#topic_list tbody tr",
        userLink: "td:last-child a[href*='/user_id/']",
        titleCell: "td.title",
        adSelectors: [
            // 精确定位广告容器（修复 ID 选择器）
            '[id="1280_adv"]',
            '[id="pkpk"]',
            '.kiwi-ad-wrapper-1280x120',
            
            // 广告追踪相关
            'a[onclick*="_trackEvent"][onclick*="ad"]',
            
            // PikPak 相关
            'a[href*="mypikpak.com/drive/url-checker"]',
            
            // 特定广告图片
            'div[align="center"] > a[href*="sng.link"] > img',
            'div[align="center"] > a[href*="weidian.com"] > img[src*="/1280pik.png"]',
            'img[src*="/VA"][src*=".gif"]'
        ]
    },
    
    // UI相关样式配置
    styles: {
        notification: `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 10001;
            font-size: 14px;
            transition: opacity 0.3s;
        `,
        blocklistUI: `
            position: fixed;
            left: 10px;
            top: 10px;
            z-index: 9999;
        `,
        manager: `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%,-50%);
            background: white;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 5px;
            z-index: 10000;
            width: 500px;
            max-height: 80vh;
            overflow-y: auto;
        `
    }
};

/**
 * 错误处理类
 */
class ErrorHandler {
    /**
     * 处理错误
     * @param {Error} error - 错误对象
     * @param {string} context - 错误发生的上下文
     */
    static handle(error, context) {
        console.warn(`[DMHY Block] Error in ${context}:`, error);
    }
}

/**
 * 通知管理类
 */
class NotificationManager {
    /**
     * 显示通知
     * @param {string} message - 通知消息
     */
    static show(message) {
        const notification = document.createElement('div');
        notification.style.cssText = CONFIG.styles.notification;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }
}

/**
 * 黑名单管理类
 */
class BlockListManager {
    constructor() {
        this.blockList = [];
        this.userNameMap = new Map();
    }

    /**
     * 初始化黑名单
     */
    async init() {
        await this.loadBlockList();
    }

    /**
     * 从存储加载黑名单
     */
    async loadBlockList() {
        try {
            const saved = GM_getValue(CONFIG.storage.blockListKey, []);
            this.blockList = Array.isArray(saved) ? this.parseBlockList(saved) : [];
        } catch (error) {
            ErrorHandler.handle(error, 'BlockListManager.loadBlockList');
            this.blockList = [];
        }
    }

    /**
     * 解析黑名单数据
     * @param {Array} saved - 保存的黑名单数据
     */
    parseBlockList(saved) {
        return saved.map(item => {
            if (item.type === 'keywords') {
                return {
                    type: 'keywords',
                    values: item.values.map(this.parseKeyword)
                };
            }
            return item;
        });
    }

    /**
     * 解析关键词
     * @param {string} keyword - 关键词
     */
    parseKeyword(keyword) {
        if (typeof keyword === 'string' && keyword.startsWith('/') && keyword.endsWith('/')) {
            try {
                return new RegExp(keyword.slice(1, -1));
            } catch (e) {
                return keyword;
            }
        }
        return keyword;
    }

    /**
     * 保存黑名单到存储
     */
    saveBlockList() {
        try {
            const listToSave = this.blockList.map(item => ({
                ...item,
                values: item.type === 'keywords' 
                    ? item.values.map(k => k instanceof RegExp ? `/${k.source}/` : k)
                    : item.values
            }));
            GM_setValue(CONFIG.storage.blockListKey, listToSave);
        } catch (error) {
            ErrorHandler.handle(error, 'BlockListManager.saveBlockList');
        }
    }

    /**
     * 添加用户到黑名单
     * @param {number} userId - 用户ID
     * @param {string} userName - 用户名
     */
    addUser(userId, userName) {
        if (!userId || isNaN(userId)) return false;
        
        const userIdList = this.getUserIds();
        if (!userIdList.includes(userId)) {
            this.updateBlockList('userId', [...userIdList, userId]);
            if (userName) {
                this.userNameMap.set(userId.toString(), userName);
                this.saveUserNameMap();
            }
            return true;
        }
        return false;
    }

    /**
     * 获取黑名单用户ID列表
     */
    getUserIds() {
        return this.blockList.find(item => item.type === 'userId')?.values || [];
    }

    /**
     * 获取黑名单关键词列表
     */
    getKeywords() {
        return this.blockList.find(item => item.type === 'keywords')?.values || [];
    }

    /**
     * 更新黑名单
     * @param {string} type - 黑名单类型
     * @param {Array} values - 黑名单值
     */
    updateBlockList(type, values) {
        const index = this.blockList.findIndex(item => item.type === type);
        if (index >= 0) {
            this.blockList[index].values = values;
        } else {
            this.blockList.push({ type, values });
        }
        this.saveBlockList();
    }

    /**
     * 保存用户名映射
     */
    saveUserNameMap() {
        GM_setValue('dmhy_username_map', Object.fromEntries(this.userNameMap));
    }

    /**
     * 加载用户名映射
     */
    async loadUserNameMap() {
        const saved = GM_getValue('dmhy_username_map', {});
        this.userNameMap = new Map(Object.entries(saved));
    }

    /**
     * 获取用户名
     * @param {number} userId - 用户ID
     * @param {boolean} forceUpdate - 是否强制更新
     */
    async getUserName(userId, forceUpdate = false) {
        if (!userId) return null;
        
        // 1. 先检查缓存
        const cachedName = this.userNameMap.get(userId.toString());
        if (cachedName && !forceUpdate) return cachedName;

        // 2. 尝试从当前页面获取
        const userLink = document.querySelector(`a[href="/topics/list/user_id/${userId}"]`);
        if (userLink) {
            const userName = userLink.textContent;
            if (userName) {
                this.userNameMap.set(userId.toString(), userName);
                this.saveUserNameMap();
                return userName;
            }
        }

        // 3. 如果当前页面找不到,使用requestIdleCallback在空闲时从远程获取
        return new Promise(resolve => {
            const callback = async () => {
                try {
                    const response = await fetch(`https://share.dmhy.org/topics/list/user_id/${userId}`);
                    const text = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    const userName = doc.querySelector(`a[href="/topics/list/user_id/${userId}"]`)?.textContent;
                    
                    if (userName) {
                        this.userNameMap.set(userId.toString(), userName);
                        this.saveUserNameMap();
                        resolve(userName);
                    } else {
                        resolve(userId.toString());
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'BlockListManager.getUserName');
                    resolve(userId.toString());
                }
            };

            // 使用requestIdleCallback在浏览器空闲时执行
            if (window.requestIdleCallback) {
                requestIdleCallback(() => callback(), { timeout: 5000 });
            } else {
                // 降级方案：使用setTimeout
                setTimeout(callback, 0);
            }
        });
    }
}

/**
 * 过滤管理类
 */
class FilterManager {
    constructor(blockListManager) {
        this.blockListManager = blockListManager;
    }

    /**
     * 初始化过滤器
     */
    init() {
        this.applyFilters();
    }

    /**
     * 应用过滤规则
     */
    applyFilters() {
        try {
            this.resetHiddenItems();
            
            if (!this.blockListManager.blockList.length) return;
            
            const blockedUserIds = this.blockListManager.getUserIds();
            const blockedKeywords = this.blockListManager.getKeywords();
            
            if (!blockedUserIds.length && !blockedKeywords.length) return;
            
            this.filterTorrentList(blockedUserIds, blockedKeywords);
        } catch (error) {
            ErrorHandler.handle(error, 'FilterManager.applyFilters');
        }
    }

    /**
     * 重置隐藏的项目
     */
    resetHiddenItems() {
        document.querySelectorAll(`${CONFIG.selectors.torrentList}[style*='display: none']`)
            .forEach(elem => elem.style.display = '');
    }

    /**
     * 过滤种子列表
     * @param {Array} blockedUserIds - 被屏蔽的用户ID
     * @param {Array} blockedKeywords - 被屏蔽的关键词
     */
    filterTorrentList(blockedUserIds, blockedKeywords) {
        document.querySelectorAll(CONFIG.selectors.torrentList).forEach(elem => {
            try {
                const { title, userId } = this.extractItemInfo(elem);
                if (!title || !userId) return;
                
                if (this.shouldHideItem(userId, title, blockedUserIds, blockedKeywords)) {
                    elem.style.display = 'none';
                }
            } catch (error) {
                ErrorHandler.handle(error, 'FilterManager.filterTorrentList.item');
            }
        });
    }

    /**
     * 提取项目信息
     * @param {Element} elem - DOM元素
     */
    extractItemInfo(elem) {
        const titleCell = elem.querySelector(CONFIG.selectors.titleCell);
        const title = titleCell ? Array.from(titleCell.childNodes)
            .map(node => node.textContent?.trim())
            .filter(text => text)
            .join(' ') : '';
            
        const idMatch = elem.querySelector(CONFIG.selectors.userLink)?.href?.match(/user_id\/(\d+)/);
        const userId = idMatch ? parseInt(idMatch[1]) : null;
        
        return { title, userId };
    }

    /**
     * 判断是否应该隐藏项目
     * @param {number} userId - 用户ID
     * @param {string} title - 标题
     * @param {Array} blockedUserIds - 被屏蔽的用户ID
     * @param {Array} blockedKeywords - 被屏蔽的关键词
     */
    shouldHideItem(userId, title, blockedUserIds, blockedKeywords) {
        if (blockedUserIds.includes(userId)) return true;
        
        return blockedKeywords.some(keyword => {
            if (typeof keyword === 'string') {
                return title.toLowerCase().includes(keyword.toLowerCase());
            }
            return keyword instanceof RegExp && title.match(keyword);
        });
    }
}

/**
 * UI管理类
 */
class UIManager {
    constructor(blockListManager, filterManager) {
        this.blockListManager = blockListManager;
        this.filterManager = filterManager;
    }

    /**
     * 初始化UI
     */
    init() {
        this.addBlocklistUI();
        this.addContextMenu();
    }

    /**
     * 添加黑名单UI
     */
    addBlocklistUI() {
        const uiHtml = `
            <div id="dmhy-blocklist-ui" style="${CONFIG.styles.blocklistUI}">
                <button id="show-blocklist">管理种子黑名单</button>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', uiHtml);
        
        document.getElementById('show-blocklist')?.addEventListener('click', 
            () => this.showBlocklistManager());
    }

    /**
     * 显示黑名单管理界面
     */
    async showBlocklistManager() {
        const loadingHtml = `
            <div id="blocklist-manager" style="${CONFIG.styles.manager}">
                <h3 style="margin-top:0;">管理种子黑名单</h3>
                <div style="text-align:center;padding:20px;">
                    正在加载用户信息...
                </div>
            </div>
            <div id="blocklist-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;
                background:rgba(0,0,0,0.5);z-index:9999;"></div>
        `;
        document.body.insertAdjacentHTML('beforeend', loadingHtml);

        // 获取所有用户名
        const userIds = this.blockListManager.getUserIds();
        const userNames = await Promise.all(
            userIds.map(async id => {
                const name = await this.blockListManager.getUserName(id);
                return name ? `${name}(${id})` : id;
            })
        );

        // 更新界面
        document.getElementById('blocklist-manager').innerHTML = `
            <h3 style="margin-top:0;">管理种子黑名单</h3>
            <div style="margin-bottom:10px;">
                <label>已屏蔽用户：</label><br>
                <textarea id="user-ids" style="width:100%;height:100px;margin-top:5px;resize:none;border:1px solid #ccc;">${userNames.join('；')}</textarea>
                <div id="user-ids-error" style="color:red;font-size:12px;margin-top:3px;display:none;"></div>
            </div>
            <div style="margin-bottom:10px;">
                <label>标题关键词（用分号分隔）：</label><br>
                <textarea id="keywords" style="width:100%;height:100px;margin-top:5px;resize:none;border:1px solid #ccc;"></textarea>
                <div id="keywords-error" style="color:red;font-size:12px;margin-top:3px;display:none;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;color:#666;font-size:12px;margin-top:5px;">
                <div style="flex:1;margin-right:10px;">
                    提示：支持普通关键词和正则表达式<br>
                    - 普通关键词直接输入，用分号分隔<br>
                    - 正则表达式用 / 包裹，例如：/\\d+话/<br>
                    - 示例：关键词1；/\\d+话/；关键词2
                </div>
                <div style="flex:1;margin-left:10px;">
                    提示：用户ID输入规则：<br>
                    - 支持纯数字ID，如：123456<br>
                    - 支持用户名(ID)格式，如：用户名(123456)<br>
                    - 多个ID之间用分号分隔
                </div>
            </div>
            <div style="margin-top:10px;text-align:right;">
                <button id="save-blocklist" style="padding:5px 15px;">保存</button>
                <button id="close-manager" style="padding:5px 15px;margin-left:10px;">关闭</button>
            </div>
        `;

        this.initManagerEvents();
        this.fillManagerData();
    }

    /**
     * 初始化管理器事件
     */
    initManagerEvents() {
        const closeManager = () => {
            document.getElementById('blocklist-manager')?.remove();
            document.getElementById('blocklist-overlay')?.remove();
        };

        // 修改保存按钮事件处理
        document.getElementById('save-blocklist')?.addEventListener('click', async () => {
            const saveResult = await this.saveManagerData();
            if (saveResult) {  // 只有在保存成功时才关闭
                closeManager();
                this.filterManager.applyFilters();
            }
        });

        document.getElementById('close-manager')?.addEventListener('click', closeManager);
        
        // 修改遮罩层点击事件
        document.getElementById('blocklist-overlay')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) {
                // 在关闭前检查是否有未保存的更改
                const userIdsChanged = this.hasUnsavedChanges();
                if (userIdsChanged) {
                    if (confirm('有未保存的更改，确定要关闭吗？')) {
                        closeManager();
                    }
                } else {
                    closeManager();
                }
            }
        });

        // 添加输入框变化事件监听
        document.getElementById('user-ids')?.addEventListener('input', () => {
            this.validateManagerData();
        });

        document.getElementById('keywords')?.addEventListener('input', () => {
            this.validateManagerData();
        });
    }

    /**
     * 填充管理器数据
     */
    fillManagerData() {
        const keywords = this.blockListManager.getKeywords();
        document.getElementById('keywords').value = keywords.map(k => {
            if (k instanceof RegExp) {
                return `/${k.source}/`;
            }
            return k;
        }).join('；');
    }

    /**
     * 检查是否有未保存的更改
     */
    hasUnsavedChanges() {
        const currentUserIds = document.getElementById('user-ids')?.value.trim() || '';
        const currentKeywords = document.getElementById('keywords')?.value.trim() || '';
        
        // 获取原始数据并格式化为相同的格式
        const originalUserIds = this.blockListManager.getUserIds()
            .map(async id => {
                const name = await this.blockListManager.getUserName(id);
                return name ? `${name}(${id})` : id;
            })
            .join('；');
        const originalKeywords = this.blockListManager.getKeywords()
            .map(k => k instanceof RegExp ? `/${k.source}/` : k)
            .join('；');

        // 标准化字符串进行比较（移除多余的空格和分号）
        const normalizeString = (str) => str.split(/[;；]/)
            .map(s => s.trim())
            .filter(s => s)
            .join('；');

        return normalizeString(currentUserIds) !== normalizeString(originalUserIds) || 
               normalizeString(currentKeywords) !== normalizeString(originalKeywords);
    }

    /**
     * 验证输入数据
     */
    validateManagerData() {
        const userIdsInput = document.getElementById('user-ids');
        const keywordsInput = document.getElementById('keywords');
        const userIdsError = document.getElementById('user-ids-error');
        const keywordsError = document.getElementById('keywords-error');
        const saveButton = document.getElementById('save-blocklist');
        
        let isValid = true;
        
        // 重置错误状态
        userIdsError.style.display = 'none';
        keywordsError.style.display = 'none';
        userIdsInput.style.borderColor = '#ccc';
        keywordsInput.style.borderColor = '#ccc';
        saveButton.style.borderColor = '';

        // 验证用户ID
        if (userIdsInput.value.trim()) {
            const items = userIdsInput.value.trim().split(/[;；]/).map(item => item.trim()).filter(item => item);
            const invalidItems = items.filter(item => {
                return !(/^\d+$/.test(item) || /^.+\(\d+\)$/.test(item));
            });

            if (invalidItems.length > 0) {
                userIdsError.textContent = `以下用户ID格式无效：${invalidItems.join('、')}`;
                userIdsError.style.display = 'block';
                userIdsInput.style.borderColor = 'red';
                isValid = false;
            }
        }

        // 验证关键词
        if (keywordsInput.value.trim()) {
            const keywords = keywordsInput.value.trim().split(/[;；]/).map(k => k.trim()).filter(k => k);
            const invalidKeywords = keywords.filter(k => {
                if (k.startsWith('/') && k.endsWith('/')) {
                    try {
                        new RegExp(k.slice(1, -1));
                        return false;
                    } catch (e) {
                        return true;
                    }
                }
                return false;
            });

            if (invalidKeywords.length > 0) {
                keywordsError.textContent = `以下正则表达式格式无效：${invalidKeywords.join('、')}`;
                keywordsError.style.display = 'block';
                keywordsInput.style.borderColor = 'red';
                isValid = false;
            }
        }

        if (!isValid) {
            saveButton.style.borderColor = 'red';
        }

        return { isValid };
    }

    /**
     * 保存管理器数据
     */
    async saveManagerData() {
        const { isValid } = this.validateManagerData();
        
        if (!isValid) {
            NotificationManager.show('请修正输入错误后再保存');
            return false;
        }

        const oldUserIds = this.blockListManager.getUserIds();
        
        // 解析新的用户ID列表
        const userIdsInput = document.getElementById('user-ids').value
            .split(/[;；]/)
            .map(item => item.trim())
            .filter(item => item);

        // 分离有效和无效的输入项
        const validIds = [];
        const invalidItems = [];
        const retainedIds = []; // 存储需要保留的ID
        
        userIdsInput.forEach(item => {
            // 规则1：纯数字ID
            if (/^\d+$/.test(item)) {
                validIds.push(parseInt(item));
                return;
            }
            
            // 规则2：用户名(数字ID)格式
            const idMatch = item.match(/^.+\((\d+)\)$/);
            if (idMatch && /^\d+$/.test(idMatch[1])) {
                validIds.push(parseInt(idMatch[1]));
                return;
            }
            
            // 检查是否为未完整删除的已保存数据
            const partialMatch = item.match(/\((\d+)/); // 匹配不完整的格式，如 "用户名(123"
            if (partialMatch) {
                const partialId = parseInt(partialMatch[1]);
                if (oldUserIds.includes(partialId)) {
                    retainedIds.push(partialId);
                    invalidItems.push(`${item} (已保留原数据)`);
                    return;
                }
            }
            
            // 不符合任何规则的输入项
            invalidItems.push(item);
        });

        // 合并有效ID和需要保留的ID
        const finalIds = [...new Set([...validIds, ...retainedIds])];

        // 如果存在无效输入项，提示用户但不影响保存操作
        if (invalidItems.length > 0) {
            NotificationManager.show(`以下内容格式无效：${invalidItems.join('、')}`);
        }

        // 保存关键词
        const newKeywords = document.getElementById('keywords').value
            .split(/[;；]/)
            .map(k => k.trim())
            .filter(k => k)
            .map(k => {
                if (k.startsWith('/') && k.endsWith('/')) {
                    try {
                        return new RegExp(k.slice(1, -1));
                    } catch (e) {
                        return k;
                    }
                }
                return k;
            });

        // 更新黑名单
        this.blockListManager.updateBlockList('userId', finalIds);
        this.blockListManager.updateBlockList('keywords', newKeywords);

        // 找出新增的用户ID
        const addedUserIds = finalIds.filter(id => !oldUserIds.includes(id));
        
        // 在后台获取新增用户的用户名
        if (addedUserIds.length > 0) {
            this.processNewUserIds(addedUserIds);
        }

        return true;
    }

    /**
     * 处理新增的用户ID
     * @param {number[]} userIds - 用户ID列表
     */
    processNewUserIds(userIds) {
        // 使用requestIdleCallback在浏览器空闲时获取用户名
        if (window.requestIdleCallback) {
            requestIdleCallback(() => {
                this.processUserNameQueue(userIds);
            }, { timeout: 1000 });
        } else {
            // 降级方案：使用setTimeout
            setTimeout(() => {
                this.processUserNameQueue(userIds);
            }, 0);
        }
    }

    /**
     * 处理用户名获取队列
     * @param {number[]} userIds - 用户ID列表
     */
    async processUserNameQueue(userIds) {
        for (const userId of userIds) {
            try {
                const userName = await this.blockListManager.getUserName(userId, true); // 强制更新用户名
                if (userName) {
                    console.log(`[DMHY Block] 成功获取用户名: ${userName}(${userId})`);
                }
            } catch (error) {
                ErrorHandler.handle(error, 'UIManager.processUserNameQueue');
            }
            // 添加延迟避免请求过于频繁
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    /**
     * 添加右键菜单
     */
    addContextMenu() {
        const menuHtml = `
            <div id="dmhy-context-menu" style="display:none;position:fixed;background:white;
                border:1px solid #ccc;border-radius:3px;padding:5px;box-shadow:2px 2px 5px rgba(0,0,0,0.2);z-index:10000;">
                <div id="block-user" style="padding:5px 10px;cursor:pointer;hover:background-color:#f0f0f0;">
                    添加用户到黑名单
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', menuHtml);
        this.initContextMenuEvents();
    }

    /**
     * 初始化右键菜单事件
     */
    initContextMenuEvents() {
        const menu = document.getElementById('dmhy-context-menu');

        document.addEventListener('contextmenu', e => {
            const userLink = e.target.closest(CONFIG.selectors.userLink);
            if (userLink) {
                e.preventDefault();
                const userId = userLink.href.match(/user_id\/(\d+)/)?.[1];
                const userName = userLink.textContent;
                if (userId) {
                    menu.style.display = 'block';
                    menu.style.left = e.clientX + 'px';
                    menu.style.top = e.clientY + 'px';
                    
                    document.getElementById('block-user').onclick = e => {
                        e.stopPropagation();
                        if (this.blockListManager.addUser(parseInt(userId), userName)) {
                            NotificationManager.show(`已将用户 ${userName}(${userId}) 添加到黑名单`);
                            this.filterManager.applyFilters();
                        } else {
                            NotificationManager.show('该用户已在黑名单中');
                        }
                        menu.style.display = 'none';
                    };
                }
            }
        });

        document.addEventListener('click', e => {
            if (!menu.contains(e.target)) {
                menu.style.display = 'none';
            }
        });

        window.addEventListener('scroll', () => {
            menu.style.display = 'none';
        });
    }
}

/**
 * 广告拦截类
 */
class AdBlocker {
    /**
     * 初始化广告拦截
     */
    static init() {
        // 1. 立即执行一次
        this.hideAds();
        
        // 2. DOMContentLoaded 时执行
        document.addEventListener('DOMContentLoaded', () => {
            this.hideAds();
        });
        
        // 3. 使用 MutationObserver 实时监控
        this.initDOMObserver();
        
        // 4. 兜底方案，页面加载完成后再次检查
        window.addEventListener('load', () => {
            this.hideAds();
        });
    }

    /**
     * 初始化DOM观察器
     */
    static initDOMObserver() {
        // 配置 MutationObserver 选项
        const config = {
            childList: true,    // 监听子节点变化
            subtree: true,      // 监听所有后代节点
            attributes: true,   // 监听属性变化
        };

        // 创建观察器实例
        const observer = new MutationObserver((mutations) => {
            // 优化性能：使用 requestAnimationFrame 避免频繁执行
            window.requestAnimationFrame(() => {
                this.hideAds();
            });
        });

        // 开始观察
        observer.observe(document.documentElement, config);
    }

    /**
     * 隐藏广告元素
     */
    static hideAds() {
        // 添加样式规则以提前隐藏广告
        if (!document.getElementById('dmhy-ad-styles')) {
            const style = document.createElement('style');
            style.id = 'dmhy-ad-styles';
            style.textContent = CONFIG.selectors.adSelectors
                .map(selector => `${selector} { display: none !important; }`)
                .join('\n');
            document.head.appendChild(style);
        }

        // 仍然保留 DOM 操作以确保完全隐藏
        CONFIG.selectors.adSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(element => {
                    if (element) {
                        element.style.setProperty('display', 'none', 'important');
                        // 可选：移除元素以彻底阻止加载
                        // element.remove();
                    }
                });
            } catch (error) {
                ErrorHandler.handle(error, 'AdBlocker.hideAds');
            }
        });
    }
}

/**
 * 事件管理类
 */
class EventManager {
    constructor(filterManager) {
        this.filterManager = filterManager;
    }

    /**
     * 初始化事件
     */
    init() {
        this.initSortingEvents();
    }

    /**
     * 初始化排序事件
     */
    initSortingEvents() {
        document.querySelectorAll("th.header").forEach(header => {
            header.addEventListener('click', () => {
                setTimeout(() => this.filterManager.applyFilters(), 100);
            });
        });
    }
}

/**
 * 应用主类
 */
class App {
    /**
     * 初始化应用
     */
    static async init() {
        try {
            // 优先初始化广告拦截
            AdBlocker.init();
            
            // 其他初始化
            const blockListManager = new BlockListManager();
            await blockListManager.init();
            
            const filterManager = new FilterManager(blockListManager);
            const uiManager = new UIManager(blockListManager, filterManager);
            const eventManager = new EventManager(filterManager);
            
            uiManager.init();
            filterManager.init();
            eventManager.init();
            
        } catch (error) {
            ErrorHandler.handle(error, 'App.init');
        }
    }
}

// 启动应用
(function() {
    'use strict';
    App.init();
})();
