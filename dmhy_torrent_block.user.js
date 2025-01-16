// ==UserScript==
// @name:zh-CN   动漫花园种子屏蔽助手
// @name         DMHY Torrent Block
// @namespace    https://github.com/xkbkx5904
// @version      1.1.6
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
// @downloadURL https://update.greasyfork.org/scripts/523811/DMHY%20Torrent%20Block.user.js
// @updateURL https://update.greasyfork.org/scripts/523811/DMHY%20Torrent%20Block.meta.js
// ==/UserScript==

/*
更新日志：
v1.1.6
- 修复关键词输入单个斜杠时的验证问题
- 优化关键词处理逻辑，将单个斜杠视为普通字符串匹配

v1.1.5
- 移除右键添加黑名单时的通知提示
- 优化代码结构，删除未使用的通知管理类
- 改进性能，减少不必要的DOM操作

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
    static handle(error, context) {
        console.warn(`[DMHY Block] Error in ${context}:`, error);
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

    async init() {
        await this.loadBlockList();
    }

    async loadBlockList() {
        try {
            const saved = GM_getValue(CONFIG.storage.blockListKey, []);
            this.blockList = Array.isArray(saved) ? saved.map(item => {
                if (item.type === 'keywords') {
                    return {
                        type: 'keywords',
                        values: item.values.map(this.parseKeyword)
                    };
                }
                return item;
            }) : [];
        } catch (error) {
            console.warn(`[DMHY Block] Error in BlockListManager.loadBlockList:`, error);
            this.blockList = [];
        }
    }

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

    getUserIds() {
        return this.blockList.find(item => item.type === 'userId')?.values || [];
    }

    getKeywords() {
        return this.blockList.find(item => item.type === 'keywords')?.values || [];
    }

    updateBlockList(type, values) {
        const index = this.blockList.findIndex(item => item.type === type);
        if (index >= 0) {
            this.blockList[index].values = values;
        } else {
            this.blockList.push({ type, values });
        }
        this.saveBlockList();
    }

    saveUserNameMap() {
        GM_setValue('dmhy_username_map', Object.fromEntries(this.userNameMap));
    }

    async getUserName(userId, forceUpdate = false) {
        if (!userId) return null;

        const cachedName = this.userNameMap.get(userId.toString());
        if (cachedName && !forceUpdate) return cachedName;

        const userLink = document.querySelector(`a[href="/topics/list/user_id/${userId}"]`);
        if (userLink) {
            const userName = userLink.textContent;
            if (userName) {
                this.userNameMap.set(userId.toString(), userName);
                this.saveUserNameMap();
                return userName;
            }
        }

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

            if (window.requestIdleCallback) {
                requestIdleCallback(() => callback(), { timeout: 5000 });
            } else {
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

    init() {
        this.applyFilters();
    }

    applyFilters() {
        try {
            document.querySelectorAll(`${CONFIG.selectors.torrentList}[style*='display: none']`)
                .forEach(elem => elem.style.display = '');

            if (!this.blockListManager.blockList.length) return;

            const blockedUserIds = this.blockListManager.getUserIds();
            const blockedKeywords = this.blockListManager.getKeywords();

            if (!blockedUserIds.length && !blockedKeywords.length) return;

            this.filterTorrentList(blockedUserIds, blockedKeywords);
        } catch (error) {
            console.warn(`[DMHY Block] Error in FilterManager.applyFilters:`, error);
        }
    }

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

    init() {
        this.addBlocklistUI();
        this.addContextMenu();
    }

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

        const userIds = this.blockListManager.getUserIds();
        const userNames = await Promise.all(
            userIds.map(async id => {
                const name = await this.blockListManager.getUserName(id);
                return name ? `${name}(${id})` : id;
            })
        );

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

    initManagerEvents() {
        const closeManager = () => {
            if (this.hasUnsavedChanges()) {
                if (confirm('有未保存的更改，确定要关闭吗？')) {
                    document.getElementById('blocklist-manager')?.remove();
                    document.getElementById('blocklist-overlay')?.remove();
                }
            } else {
                document.getElementById('blocklist-manager')?.remove();
                document.getElementById('blocklist-overlay')?.remove();
            }
        };

        document.getElementById('close-manager')?.addEventListener('click', closeManager);

        document.getElementById('blocklist-overlay')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) {
                closeManager();
            }
        });

        document.getElementById('save-blocklist')?.addEventListener('click', async () => {
            const saveResult = await this.saveManagerData();
            if (saveResult) {
                closeManager();
                this.filterManager.applyFilters();
            }
        });

        document.getElementById('user-ids')?.addEventListener('input', () => {
            this.validateManagerData();
        });

        document.getElementById('keywords')?.addEventListener('input', () => {
            this.validateManagerData();
        });
    }

    fillManagerData() {
        const keywords = this.blockListManager.getKeywords();
        document.getElementById('keywords').value = keywords.map(k => {
            if (k instanceof RegExp) {
                return `/${k.source}/`;
            }
            return k;
        }).join('；');
    }

    hasUnsavedChanges() {
        const currentUserIds = document.getElementById('user-ids')?.value.trim() || '';
        const currentKeywords = document.getElementById('keywords')?.value.trim() || '';

        const originalUserIds = this.blockListManager.getUserIds()
            .map(id => {
                const name = this.blockListManager.userNameMap.get(id.toString());
                return name ? `${name}(${id})` : id;
            })
            .join('；');

        const originalKeywords = this.blockListManager.getKeywords()
            .map(k => k instanceof RegExp ? `/${k.source}/` : k)
            .join('；');

        const normalizeString = (str) => str.split(/[;；]/)
            .map(s => s.trim())
            .filter(s => s)
            .sort()
            .join('；');

        return normalizeString(currentUserIds) !== normalizeString(originalUserIds) ||
               normalizeString(currentKeywords) !== normalizeString(originalKeywords);
    }

    validateManagerData() {
        const userIdsInput = document.getElementById('user-ids');
        const keywordsInput = document.getElementById('keywords');
        const userIdsError = document.getElementById('user-ids-error');
        const keywordsError = document.getElementById('keywords-error');
        const saveButton = document.getElementById('save-blocklist');

        let isValid = true;

        userIdsError.style.display = 'none';
        keywordsError.style.display = 'none';
        userIdsInput.style.borderColor = '#ccc';
        keywordsInput.style.borderColor = '#ccc';
        saveButton.style.borderColor = '';

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

        if (keywordsInput.value.trim()) {
            const keywords = keywordsInput.value.trim().split(/[;；]/).map(k => k.trim()).filter(k => k);
            const invalidKeywords = keywords.filter(k => {
                if (k === '/') return false;
                
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

    async saveManagerData() {
        const { isValid } = this.validateManagerData();

        if (!isValid) {
            alert('请修正输入错误后再保存');
            return false;
        }

        const oldUserIds = this.blockListManager.getUserIds();

        const userIdsInput = document.getElementById('user-ids').value
            .split(/[;；]/)
            .map(item => item.trim())
            .filter(item => item);

        const validIds = [];
        const invalidItems = [];
        const retainedIds = [];

        userIdsInput.forEach(item => {
            if (/^\d+$/.test(item)) {
                validIds.push(parseInt(item));
                return;
            }

            const idMatch = item.match(/^.+\((\d+)\)$/);
            if (idMatch && /^\d+$/.test(idMatch[1])) {
                validIds.push(parseInt(idMatch[1]));
                return;
            }

            const partialMatch = item.match(/\((\d+)/);
            if (partialMatch) {
                const partialId = parseInt(partialMatch[1]);
                if (oldUserIds.includes(partialId)) {
                    retainedIds.push(partialId);
                    invalidItems.push(`${item} (已保留原数据)`);
                    return;
                }
            }

            invalidItems.push(item);
        });

        const finalIds = [...new Set([...validIds, ...retainedIds])];

        if (invalidItems.length > 0) {
            alert(`以下内容格式无效：${invalidItems.join('、')}`);
        }

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

        this.blockListManager.updateBlockList('userId', finalIds);
        this.blockListManager.updateBlockList('keywords', newKeywords);

        const addedUserIds = finalIds.filter(id => !oldUserIds.includes(id));

        if (addedUserIds.length > 0) {
            this.processNewUserIds(addedUserIds);
        }

        return true;
    }

    processNewUserIds(userIds) {
        if (window.requestIdleCallback) {
            requestIdleCallback(() => {
                this.processUserNameQueue(userIds);
            }, { timeout: 1000 });
        } else {
            setTimeout(() => {
                this.processUserNameQueue(userIds);
            }, 0);
        }
    }

    async processUserNameQueue(userIds) {
        for (const userId of userIds) {
            try {
                const userName = await this.blockListManager.getUserName(userId, true);
                if (userName) {
                    console.log(`[DMHY Block] 成功获取用户名: ${userName}(${userId})`);
                }
            } catch (error) {
                ErrorHandler.handle(error, 'UIManager.processUserNameQueue');
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

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
                            this.filterManager.applyFilters();
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
    static init() {
        this.hideAds();

        document.addEventListener('DOMContentLoaded', () => {
            this.hideAds();
        });

        this.initDOMObserver();

        window.addEventListener('load', () => {
            this.hideAds();
        });
    }

    static initDOMObserver() {
        const config = {
            childList: true,
            subtree: true,
            attributes: true,
        };

        const observer = new MutationObserver((mutations) => {
            window.requestAnimationFrame(() => {
                this.hideAds();
            });
        });

        observer.observe(document.documentElement, config);
    }

    static hideAds() {
        if (!document.getElementById('dmhy-ad-styles')) {
            const style = document.createElement('style');
            style.id = 'dmhy-ad-styles';
            style.textContent = CONFIG.selectors.adSelectors
                .map(selector => `${selector} { display: none !important; }`)
                .join('\n');
            document.head.appendChild(style);
        }

        CONFIG.selectors.adSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(element => {
                    if (element) {
                        element.style.setProperty('display', 'none', 'important');
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

    init() {
        this.initSortingEvents();
    }

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
    static async init() {
        try {
            AdBlocker.init();

            const blockListManager = new BlockListManager();
            await blockListManager.init();

            const filterManager = new FilterManager(blockListManager);
            const uiManager = new UIManager(blockListManager, filterManager);
            const eventManager = new EventManager(filterManager);

            uiManager.init();
            filterManager.init();
            eventManager.init();
        } catch (error) {
            console.warn(`[DMHY Block] Error in App.init:`, error);
        }
    }
}

// 启动应用
(function() {
    'use strict';
    App.init();
})();
