// js/vue-app.js — Vue 3 应用入口（所有组件预加载，无懒加载，确保兼容）

;(function() {
  'use strict';

  if (typeof Vue === 'undefined') {
    console.warn('Vue 3 not loaded, falling back to vanilla JS');
    return;
  }

  var app = Vue.createApp({
    template: '<component :is="currentView" :key="pageKey"></component>',
    data: function() {
      return {
        currentPage: 'home',
        isMobileMenuOpen: false,
        isDarkTheme: document.documentElement.getAttribute('data-theme') === 'dark',
        pageLoaded: {},
        chatTick: 0,
        pageTick: 0 // 任意页面强制重建计数：clearData/保存删除自定义场景等改数据后递增，使 :key 变化重建组件
      };
    },
    computed: {
      currentView: function() {
        var map = {
          'home': 'home-page',
          'skeleton': 'skeleton-page',
          'training': 'training-page',
          'stems': 'stems-page',
          'ai': 'ai-page',
          'scene': 'scene-page',
          'sceneChat': 'scene-page',
'schedule': 'schedule-page',
	          'wordlist': 'wordlist-page'
        };
        return map[this.currentPage] || 'home-page';
      },
      pageKey: function() {
        // 页面 key = 页面名 + 重建计数。递增 pageTick 可强制任意页面重建（清数据/保存自定义场景后刷新等）。
        // 临境对话页额外叠加 chatTick：每条新消息递增 → key 变化 → 组件重建 → computed 重新求值渲染最新消息。
        // （sceneChatState 等是非响应式全局对象，不能依赖 computed 缓存，必须靠 key 重建刷新）
        if (this.currentPage === 'sceneChat') return 'scene-chat-' + this.chatTick + '-' + this.pageTick;
        return this.currentPage + '-' + this.pageTick;
      }
    },
    methods: {
      navigate: function(page) {
        this.isMobileMenuOpen = false;
        this.currentPage = page;
      },
      // 强制重绘临境对话页：递增 chatTick 使 :key 变化 → 组件销毁重建 → 重新渲染最新消息
      refreshSceneChat: function() {
        this.chatTick++;
      },
      // 强制重绘当前页：递增 pageTick 使 :key 变化 → 组件销毁重建 → computed 重新求值
      // （用于 clearData / saveCustomScene / deleteCustomScene 等修改数据后刷新页面）
      refreshPage: function() {
        this.pageTick++;
      }
    }
  });

  // 注册所有组件（全部预加载，确保动态组件按名称匹配）
  var allComponents = {
    'home-page': window.HomePageComponent,
    'skeleton-page': window.SkeletonPageComponent,
    'training-page': window.TrainingPageComponent,
    'stems-page': window.StemsPageComponent,
    'ai-page': window.AiPageComponent,
    'scene-page': window.ScenePageComponent,
'schedule-page': window.SchedulePageComponent,
	    'wordlist-page': window.WordListPageComponent
  };

  Object.keys(allComponents).forEach(function(name) {
    if (allComponents[name]) {
      app.component(name, allComponents[name]);
    }
  });

  window.vueApp = app.mount('#vue-root');
  console.log('Vue 3 app mounted');
})();
