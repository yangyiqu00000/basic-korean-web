// js/vue-app.js — Vue 3 Design System 组件注册（仅提供组件，不接管路由）

;(function() {
  'use strict';

  if (typeof Vue === 'undefined') {
    console.warn('Vue 3 not loaded, falling back to vanilla JS');
    return;
  }

  var app = Vue.createApp({});

  // 注册所有 Design System 组件（仅用于 app.js render 函数中的 Vue 组件标签）
  var components = {
    'bk-button': window.BkButtonComponent,
    'bk-card': window.BkCardComponent,
    'bk-badge': window.BkBadgeComponent,
    'bk-modal': window.BkModalComponent,
    'bk-page-header': window.BkPageHeaderComponent,
    'bk-progress-bar': window.BkProgressBarComponent,
    'bk-tip-banner': window.BkTipBannerComponent,
    'bk-color-legend': window.BkColorLegendComponent
  };

  Object.keys(components).forEach(function(name) {
    if (components[name]) {
      app.component(name, components[name]);
    }
  });

  // 挂载到一个隐藏容器，使组件可被 app.js 的 innerHTML 渲染使用
  // 注意：innerHTML 中的 Vue 组件标签只有被 Vue 管理的模板才会编译
  // 这里仅注册但不挂载到主 DOM，组件通过 app.js 的字符串模板中使用
  // 实际上 Vue 组件标签在 innerHTML 中不会被编译，所以这里实际作用有限
  // 但保留注册以便未来渐进式使用
  
  console.log('Vue 3 Design System ready');
})();
