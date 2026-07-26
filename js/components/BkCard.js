;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkCardComponent = {
    template: '#bk-card-template',
    props: {
      hoverable: { type: Boolean, default: true },
      padding: { type: String, default: 'md' }
    }
  };
})();