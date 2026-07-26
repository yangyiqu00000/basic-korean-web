// js/vue-app.js — Vue 3 渐进式迁移入口（懒加载版）

;(function() {
  'use strict';

  if (typeof Vue === 'undefined') {
    console.warn('Vue 3 not loaded, falling back to vanilla JS');
    return;
  }

  // 关键组件映射（已通过 script 标签加载）
  var criticalComponents = {
    'home-page': window.HomePageComponent,
    'stats-panel': window.StatsPanelComponent,
    'bk-button': window.BkButtonComponent,
    'bk-card': window.BkCardComponent,
    'bk-badge': window.BkBadgeComponent,
    'bk-modal': window.BkModalComponent,
    'bk-page-header': window.BkPageHeaderComponent,
    'bk-progress-bar': window.BkProgressBarComponent,
    'bk-tip-banner': window.BkTipBannerComponent,
    'bk-color-legend': window.BkColorLegendComponent
  };

  // 页面组件与懒加载文件名的映射
  var pageComponentMap = {
    'skeleton': 'SkeletonPage',
    'training': 'TrainingPage',
    'stems': 'StemsPage',
    'ai': 'AiPage',
    'scene': 'ScenePage',
    'schedule': 'SchedulePage',
    'reference': 'ReferencePage'
  };

  var app = Vue.createApp({
    data: function() {
      return {
        currentPage: 'home',
        isMobileMenuOpen: false,
        isDarkTheme: document.documentElement.getAttribute('data-theme') === 'dark',
        pageLoaded: {}  // 跟踪每页组件是否已加载
      };
    },
    methods: {
      navigate: function(page) {
        var self = this;
        this.currentPage = page;
        this.isMobileMenuOpen = false;

        // 如果是首页，不需要懒加载
        if (page === 'home') {
          if (typeof window.navigate === 'function') {
            window.navigate(page);
          }
          return;
        }

        // 检查页面组件是否已加载
        var componentName = pageComponentMap[page];
        if (!componentName) {
          if (typeof window.navigate === 'function') {
            window.navigate(page);
          }
          return;
        }

        // 如果组件已加载，直接导航
        if (this.pageLoaded[page]) {
          if (typeof window.navigate === 'function') {
            window.navigate(page);
          }
          return;
        }

        // 异步加载组件，加载完成后导航
        if (typeof window.loadComponent === 'function') {
          window.loadComponent(componentName).then(function() {
            self.pageLoaded[page] = true;
            if (typeof window.navigate === 'function') {
              window.navigate(page);
            }
          }).catch(function(err) {
            console.error('Failed to load page component:', err);
            // 回退到原生 JS
            if (typeof window.navigate === 'function') {
              window.navigate(page);
            }
          });
        } else {
          if (typeof window.navigate === 'function') {
            window.navigate(page);
          }
        }
      },
      toggleTheme: function() {
        if (typeof window.toggleTheme === 'function') {
          window.toggleTheme();
        }
        this.isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
      },
      toggleMobileMenu: function() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        if (typeof window.toggleMobileMenu === 'function') {
          window.toggleMobileMenu();
        }
      },
      openStats: function() {
        if (typeof window.openStats === 'function') {
          window.openStats();
        }
      }
    }
  });

  // 注册关键组件（首屏必需的）
  Object.keys(criticalComponents).forEach(function(name) {
    if (criticalComponents[name]) {
      app.component(name, criticalComponents[name]);
    }
  });

  // 标记已通过 script 预加载的组件
  if (typeof window.markComponentLoaded === 'function') {
    window.markComponentLoaded('HomePage');
    window.markComponentLoaded('StatsPanel');
  }

  window.vueApp = app.mount('#app');
  console.log('Vue 3 app mounted (lazy loading mode)');
})();