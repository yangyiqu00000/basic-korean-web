// js/components/StemsPage.js — stems-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.StemsPageComponent = {
    template: '<div class="stems-page-vue" v-once v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderStems === 'function') return window.renderStems();
        return '';
      }
    }
  };
})();
