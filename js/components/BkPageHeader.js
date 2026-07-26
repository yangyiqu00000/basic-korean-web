;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkPageHeaderComponent = {
    template: '#bk-page-header-template',
    props: {
      icon: { type: String, default: '' },
      title: { type: String, default: '' },
      desc: { type: String, default: '' }
    }
  };
})();
