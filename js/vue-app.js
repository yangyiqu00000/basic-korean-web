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
        pageLoaded: {}
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
          'reference': 'reference-page'
        };
        return map[this.currentPage] || 'home-page';
      },
      pageKey: function() {
        // 临境页面有双模式（列表/对话），用 key 强制重建组件
        if (this.currentPage === 'sceneChat') return 'scene-chat';
        return this.currentPage;
      }
    },
    methods: {
      navigate: function(page) {
        this.isMobileMenuOpen = false;
        this.currentPage = page;
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
    'reference-page': window.ReferencePageComponent,
    'stats-panel': window.StatsPanelComponent
  };

  Object.keys(allComponents).forEach(function(name) {
    if (allComponents[name]) {
      app.component(name, allComponents[name]);
    }
  });

  window.vueApp = app.mount('#vue-root');
  console.log('Vue 3 app mounted');
})();
