;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkBadgeComponent = {
    template: '#bk-badge-template',
    props: {
      color: { type: String, default: 'primary' },
      size: { type: String, default: 'sm' }
    },
    computed: {
      classes: function() {
        return 'bk-badge bk-badge-' + this.color + ' bk-badge-' + this.size;
      }
    }
  };
})();