;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkButtonComponent = {
    template: '#bk-button-template',
    props: {
      variant: { type: String, default: 'primary' },
      size: { type: String, default: 'md' },
      disabled: { type: Boolean, default: false }
    },
    computed: {
      classes: function() {
        return 'bk-btn bk-btn-' + this.variant + ' bk-btn-' + this.size;
      }
    }
  };
})();