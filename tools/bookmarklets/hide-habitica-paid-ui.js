// Habitica UI.DOM.
javascript:(()=>{const css=`
  [href="/shops"]{display:none!important;}
  .sidebar .rewards,.right-panel .rewards{display:none!important;}
  .gems,.gem-balance,[class*="gem"]{display:none!important;}
  .tasks-page .rewards,[data-test="rewards"],.reward-column,.shop,.tasks-page .tier-list,
  .task-column--rewards,[aria-label=""],[data-testid="rewards"]{display:none!important;}
`;const s=document.createElement('style');s.textContent=css;document.documentElement.appendChild(s);alert(':HabiticaUI');})();
