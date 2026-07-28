// js/components/SkeletonPage.js — 骨架规则页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.SkeletonPageComponent = {
    template: '<div class="skeleton-page-vue"></div>',
    mounted: function() {
      if (typeof window.renderSkeleton === 'function') {
        this.$el.innerHTML = window.renderSkeleton();
      }
    }
  };
})();
