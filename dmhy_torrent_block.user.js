// ==UserScript==
// @name:zh-CN   动漫花园种子屏蔽助手
// @name         DMHY Torrent Block
// @namespace    https://github.com/xkbkx5904
// @version      1.1.1
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
v1.1.1
- 修复数字ID选择器的兼容性问题
- 优化广告屏蔽性能和时机
- 改进广告选择器的精确度
- 统一广告和PikPak按钮的处理逻辑

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
     */
    addUser(userId) {
        if (!userId || isNaN(userId)) return false;
        
        const userIdList = this.getUserIds();
        if (!userIdList.includes(userId)) {
            this.updateBlockList('userId', [...userIdList, userId]);
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
    showBlocklistManager() {
        const managerHtml = `
            <div id="blocklist-manager" style="${CONFIG.styles.manager}">
                <h3 style="margin-top:0;">管理种子黑名单</h3>
                <div style="margin-bottom:10px;">
                    <label>用户ID（用分号分隔）：</label><br>
                    <textarea id="user-ids" style="width:100%;height:100px;margin-top:5px;resize:none;"></textarea>
                </div>
                <div style="margin-bottom:10px;">
                    <label>标题关键词（用分号分隔）：</label><br>
                    <textarea id="keywords" style="width:100%;height:100px;margin-top:5px;resize:none;"></textarea>
                </div>
                <div style="display:flex;justify-content:space-between;color:#666;font-size:12px;margin-top:5px;">
                    <div style="flex:1;margin-right:10px;">
                        提示：支持普通关键词和正则表达式<br>
                        - 普通关键词直接输入，用分号分隔<br>
                        - 正则表达式用 / 包裹，例如：/\\d+话/<br>
                        - 示例：关键词1；/\\d+话/；关键词2
                    </div>
                    <div style="flex:1;margin-left:10px;">
                        提示：用户ID获取方式：<br>
                        - 在用户名上右键点击，选择"添加用户到黑名单"<br>
                        - 或点击用户名，从URL中获取数字ID
                    </div>
                </div>
                <div style="margin-top:10px;text-align:right;">
                    <button id="save-blocklist">保存</button>
                    <button id="close-manager">关闭</button>
                </div>
            </div>
            <div id="blocklist-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;
                background:rgba(0,0,0,0.5);z-index:9999;"></div>
        `;

        document.body.insertAdjacentHTML('beforeend', managerHtml);
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

        document.getElementById('save-blocklist')?.addEventListener('click', () => {
            this.saveManagerData();
            closeManager();
            this.filterManager.applyFilters();
        });

        document.getElementById('close-manager')?.addEventListener('click', closeManager);
        document.getElementById('blocklist-overlay')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeManager();
        });
    }

    /**
     * 填充管理器数据
     */
    fillManagerData() {
        const userIds = this.blockListManager.getUserIds();
        const keywords = this.blockListManager.getKeywords();

        document.getElementById('user-ids').value = userIds.join('；');
        document.getElementById('keywords').value = keywords.map(k => {
            if (k instanceof RegExp) {
                return `/${k.source}/`;
            }
            return k;
        }).join('；');
    }

    /**
     * 保存管理器数据
     */
    saveManagerData() {
        const newUserIds = document.getElementById('user-ids').value
            .split(/[;；]/)
            .map(id => id.trim())
            .filter(id => id && !isNaN(id))
            .map(id => parseInt(id));

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

        this.blockListManager.updateBlockList('userId', newUserIds);
        this.blockListManager.updateBlockList('keywords', newKeywords);
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
                if (userId) {
                    menu.style.display = 'block';
                    menu.style.left = e.clientX + 'px';
                    menu.style.top = e.clientY + 'px';
                    
                    document.getElementById('block-user').onclick = e => {
                        e.stopPropagation();
                        if (this.blockListManager.addUser(parseInt(userId))) {
                            NotificationManager.show('已将用户ID: ' + userId + ' 添加到黑名单');
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
