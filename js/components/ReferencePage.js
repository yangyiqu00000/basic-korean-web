// js/components/ReferencePage.js — 参考页（拾遗）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.ReferencePageComponent = {
    template: '#reference-page-template',
    data: function() {
      return {
        ref: window.REFERENCE || { particles: [], endings: [], questionWords: [] }
      };
    }
  };
})();