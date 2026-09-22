// Safety net for a rare PixiJS v8 edge case: a render group's "renderables to update" list can end up
// holding an empty (null) or destroyed entry when objects are destroyed while an update is queued,
// and the next render then throws ("reading 'renderPipeId' of null") and skips the frame.
// We compact those lists once per frame, after all game updates and right before Pixi renders.
import { UPDATE_PRIORITY } from 'pixi.js';

function clean(rg) {
  const u = rg.childrenRenderablesToUpdate;
  if (u) {
    let j = 0;
    for (let i = 0; i < u.index; i++) {
      const c = u.list[i];
      if (c && !c.destroyed) u.list[j++] = c;
    }
    for (let i = j; i < u.index; i++) u.list[i] = null;
    u.index = j;
  }
  rg.renderGroupChildren?.forEach(clean);
}

export function guardRenderGroups(app) {
  // after NORMAL (game logic, tweens) and before LOW (the application's own render call)
  app.ticker.add(() => { if (app.stage.renderGroup) clean(app.stage.renderGroup); }, null, UPDATE_PRIORITY.LOW + 1);
}
