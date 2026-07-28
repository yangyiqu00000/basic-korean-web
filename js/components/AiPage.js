// js/components/AiPage.js — ai-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.AiPageComponent = {
    template: '<div class="ai-page-vue" v-once v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderAI === 'function') return window.renderAI();
        return '';
      }
    }
  };
})();
