// js/components/SkeletonPage.js — 骨架规则页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.SkeletonPageComponent = {
    template: '<div class="skeleton-page-vue" v-once v-html="skeletonHtml"></div>',
    computed: {
      skeletonHtml: function() {
        if (typeof window.renderSkeleton === 'function') {
          return window.renderSkeleton();
        }
        return '';
      }
    }
  };
})();
