;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkColorLegendComponent = {
    template: '#bk-color-legend-template',
    props: {
      compact: { type: Boolean, default: false }
    },
    data: function() {
      return {
        elems: [
          { cls: 'elem-stem', label: '词干/词根' },
          { cls: 'elem-particle', label: '助词' },
          { cls: 'elem-ending-terminal', label: '终结词尾' },
          { cls: 'elem-ending-connective', label: '连接词尾' },
          { cls: 'elem-ending-tense', label: '时态词尾' },
          { cls: 'elem-negation', label: '否定' },
          { cls: 'elem-mood', label: '语气' }
        ]
      };
    }
  };
})();
