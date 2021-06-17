Hooks.on("ready", () => {
  libWrapper.register(
    _levelsModuleName,
    "Token.prototype.refresh",
    _levelsTokenRefresh,
    "OVERRIDE"
  );
  libWrapper.register(
    _levelsModuleName,
    "Token.prototype._onMovementFrame",
    _levelsOnMovementFrame,
    "OVERRIDE"
  );
  libWrapper.register(
    _levelsModuleName,
    "LightingLayer.prototype.refresh",
    _lightingRefresh,
    "OVERRIDE"
  );
  libWrapper.register(
    _levelsModuleName,
    "SightLayer.prototype.testVisibility",
    _levelsTestVisibility,
    "OVERRIDE"
  );
  libWrapper.register(
    _levelsModuleName,
    "WallsLayer.prototype.getRayCollisions",
    _levelsGetRayCollisions,
    "OVERRIDE"
  );
  libWrapper.register(
    _levelsModuleName,
    "WallsLayer.prototype.checkCollision",
    _levelsCheckCollision,
    "OVERRIDE"
  );
  libWrapper.register(
    _levelsModuleName,
    "AmbientSound.prototype.isAudible",
    _levelsIsAudible,
    "OVERRIDE"
  );
  if (_betterRoofs) _betterRoofs.initializeRoofs();
});

Hooks.on("init", () => {
  game.settings.register(_levelsModuleName, "tokenElevScale", {
    name: game.i18n.localize("levels.settings.tokenElevScale.name"),
    hint: game.i18n.localize("levels.settings.tokenElevScale.name"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (setting) => {
      _levels.elevationScale = setting;
      _levels.updateScales();
    },
  });

  game.settings.register(_levelsModuleName, "fogHiding", {
    name: game.i18n.localize("levels.settings.fogHiding.name"),
    hint: game.i18n.localize("levels.settings.fogHiding.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (setting) => {
      _levels.fogHiding = setting;
      _levels._onElevationChangeUpdate();
    },
  });

  game.settings.register(_levelsModuleName, "lockElevation", {
    name: game.i18n.localize("levels.settings.lockElevation.name"),
    hint: game.i18n.localize("levels.settings.lockElevation.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(_levelsModuleName, "enableTooltips", {
    name: game.i18n.localize("levels.settings.enableTooltips.name"),
    hint: game.i18n.localize("levels.settings.enableTooltips.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

Hooks.on("renderTileConfig", (app, html, data) => {
  let heightRangeTop = app.object.getFlag(_levelsModuleName, "rangeTop");
  if (heightRangeTop == undefined || heightRangeTop == null)
    heightRangeTop = Infinity;

  let heightRangeBottom = app.object.getFlag(_levelsModuleName, "rangeBottom");
  if (heightRangeBottom == undefined || heightRangeBottom == null)
    heightRangeBottom = -Infinity;

  let newHtml = `
  <div class="form-group">
  <label for="rangeTop">${game.i18n.localize(
    "levels.tilecoonfig.rangeTop.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
  <div class="form-fields">
      <input type="text" name="flags.${_levelsModuleName}.rangeTop"  data-dtype="Number" value="${heightRangeTop}" step="1">
  </div>
</div>

<div class="form-group">
<label for="rangeBottom">${game.i18n.localize(
    "levels.tilecoonfig.rangeBottom.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
    <input type="text" name="flags.${_levelsModuleName}.rangeBottom" data-dtype="Number" value="${heightRangeBottom}" step="1">
</div>
</div>

`;
  const overh = html.find('input[name="occlusion.alpha"]');
  const formGroup = overh.closest(".form-group");
  formGroup.after(newHtml);
  app.setPosition({ height: "auto" });
});

Hooks.on("renderLightConfig", (app, html, data) => {
  let heightRangeTop = app.object.getFlag(_levelsModuleName, "rangeTop");
  if (heightRangeTop == undefined || heightRangeTop == null)
    heightRangeTop = Infinity;

  let heightRangeBottom = app.object.getFlag(_levelsModuleName, "rangeBottom");
  if (heightRangeBottom == undefined || heightRangeBottom == null)
    heightRangeBottom = -Infinity;

  let newHtml = `
<div class="form-group">
<label for="rangeTop">${game.i18n.localize(
    "levels.tilecoonfig.rangeTop.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
    <input type="text" name="flags.${_levelsModuleName}.rangeTop"  data-dtype="Number" value="${heightRangeTop}" step="1">
</div>
</div>

<div class="form-group">
<label for="rangeBottom">${game.i18n.localize(
    "levels.tilecoonfig.rangeBottom.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
  <input type="text" name="flags.${_levelsModuleName}.rangeBottom"  data-dtype="Number" value="${heightRangeBottom}" step="1">
</div>
</div>

`;
  const overh = html.find('input[name="angle"]');
  const formGroup = overh.closest(".form-group");
  formGroup.after(newHtml);
  app.setPosition({ height: "auto" });
});

Hooks.on("renderNoteConfig", (app, html, data) => {
  let heightRangeTop = app.object.getFlag(_levelsModuleName, "rangeTop");
  if (heightRangeTop == undefined || heightRangeTop == null)
    heightRangeTop = Infinity;

  let heightRangeBottom = app.object.getFlag(_levelsModuleName, "rangeBottom");
  if (heightRangeBottom == undefined || heightRangeBottom == null)
    heightRangeBottom = -Infinity;

  let newHtml = `
<div class="form-group">
<label for="rangeTop">${game.i18n.localize(
    "levels.tilecoonfig.rangeTop.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
    <input type="text" name="flags.${_levelsModuleName}.rangeTop"  data-dtype="Number" value="${heightRangeTop}" step="1">
</div>
</div>

<div class="form-group">
<label for="rangeBottom">${game.i18n.localize(
    "levels.tilecoonfig.rangeBottom.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
  <input type="text" name="flags.${_levelsModuleName}.rangeBottom"  data-dtype="Number" value="${heightRangeBottom}" step="1">
</div>
</div>

`;
  const overh = html.find('select[name="textAnchor"]');
  const formGroup = overh.closest(".form-group");
  formGroup.after(newHtml);
  app.setPosition({ height: "auto" });
});

Hooks.on("renderAmbientSoundConfig", (app, html, data) => {
  let heightRangeTop = app.object.getFlag(_levelsModuleName, "rangeTop");
  if (heightRangeTop == undefined || heightRangeTop == null)
    heightRangeTop = Infinity;

  let heightRangeBottom = app.object.getFlag(_levelsModuleName, "rangeBottom");
  if (heightRangeBottom == undefined || heightRangeBottom == null)
    heightRangeBottom = -Infinity;

  let newHtml = `
<div class="form-group">
<label for="rangeTop">${game.i18n.localize(
    "levels.tilecoonfig.rangeTop.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
    <input type="text" name="flags.${_levelsModuleName}.rangeTop"  data-dtype="Number" value="${heightRangeTop}" step="1">
</div>
</div>

<div class="form-group">
<label for="rangeBottom">${game.i18n.localize(
    "levels.tilecoonfig.rangeBottom.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
  <input type="text" name="flags.${_levelsModuleName}.rangeBottom"  data-dtype="Number" value="${heightRangeBottom}" step="1">
</div>
</div>

`;
  const overh = html
    .find('p[class="hint"]')
    .eq(html.find('p[class="hint"]').length - 1);
  const formGroup = overh.closest(".form-group");
  formGroup.after(newHtml);
  app.setPosition({ height: "auto" });
});

Hooks.on("renderDrawingConfig", (app, html, data) => {
  let heightRangeTop = app.object.getFlag(_levelsModuleName, "rangeTop");
  if (heightRangeTop == undefined || heightRangeTop == null)
    heightRangeTop = Infinity;

  let heightRangeBottom = app.object.getFlag(_levelsModuleName, "rangeBottom");
  if (heightRangeBottom == undefined || heightRangeBottom == null)
    heightRangeBottom = -Infinity;

  let drawingMode = app.object.getFlag(_levelsModuleName, "drawingMode") || 0;
  let opt0 = drawingMode == 0 ? `selected=""` : ``;
  let opt1 = drawingMode == 1 ? `selected=""` : ``;
  let opt2 = drawingMode == 2 ? `selected=""` : ``;
  let opt3 = drawingMode == 3 ? `selected=""` : ``;

  let elevatorFloors =
    app.object.getFlag(_levelsModuleName, "elevatorFloors") || "";

  const newHtml = `

<div class="form-group">
            <label>${game.i18n.localize(
              "levels.drawingconfig.isHole.name"
            )}</label>
            <div class="form-fields">
                <select name="flags.${_levelsModuleName}.drawingMode" data-dtype="Number">
                    <option value="0" ${opt0}>${game.i18n.localize(
    "levels.drawingconfig.isHole.opt0"
  )}</option><option value="1" ${opt1}>${game.i18n.localize(
    "levels.drawingconfig.isHole.opt1"
  )}</option><option value="2" ${opt2}>${game.i18n.localize(
    "levels.drawingconfig.isHole.opt2"
  )}</option><option value="3" ${opt3}>${game.i18n.localize(
    "levels.drawingconfig.isHole.opt3"
  )}</option>
                </select>
            </div>
        </div>

<div class="form-group">
<p class="notes">${game.i18n.localize(
    "levels.drawingconfig.elevatorFloors.hint"
  )}.</p>
<label for="elevatorFloors">${game.i18n.localize(
    "levels.drawingconfig.elevatorFloors.name"
  )}</label>
<div class="form-fields">
    <input type="text" name="flags.${_levelsModuleName}.elevatorFloors" value="${elevatorFloors}">
</div>
</div>


<div class="form-group">
<label for="rangeTop">${game.i18n.localize(
    "levels.drawingconfig.ht.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
    <input type="text" name="flags.${_levelsModuleName}.rangeTop"  data-dtype="Number" value="${heightRangeTop}" step="1">
</div>
</div>

<div class="form-group">
<label for="rangeBottom">${game.i18n.localize(
    "levels.drawingconfig.hb.name"
  )}<span class="units">(${game.i18n.localize(
    "levels.tilecoonfig.range.unit"
  )})</span></label>
<div class="form-fields">
  <input type="text" name="flags.${_levelsModuleName}.rangeBottom"  data-dtype="Number" value="${heightRangeBottom}" step="1">
</div>
</div>

`;
  const overh = html.find('input[name="z"]');
  const formGroup = overh.closest(".form-group");
  formGroup.after(newHtml);
  app.setPosition({ height: "auto" });
});

Hooks.on("renderDrawingHUD", (data, hud, drawData) => {
  let drawing = data.object.document;
  if (drawing.getFlag(_levelsModuleName, "drawingMode")) {
    let active = drawing.getFlag(_levelsModuleName, "stairLocked") || false;
    let toggleStairbtn = `<div class="control-icon${
      active ? " active" : ""
    }" id="toggleStair">
              <i class="fas fa-lock" width="36" height="36" title='${game.i18n.localize(
                "levels.drawingHud.title"
              )}'></i>
                              </div>`;
    const controlIcons = hud.find("div.control-icon");
    controlIcons.last().after(toggleStairbtn);
    $(hud.find(`div[id="toggleStair"]`)).on("click", test);
    function test() {
      console.log("test");
      active = !active;
      drawing.setFlag(
        _levelsModuleName,
        "stairLocked",
        !(drawing.getFlag(_levelsModuleName, "stairLocked") || false)
      );
      let hudbtn = hud.find(`div[id="toggleStair"]`);
      if (active) hudbtn.addClass("active");
      else hudbtn.removeClass("active");
    }
  }
});

Hooks.on("renderTokenHUD", (data, hud, drawData) => {
  if (
    game.settings.get(_levelsModuleName, "lockElevation") &&
    !game.user.isGM
  ) {
    const controlIcons = hud.find(`div[class="attribute elevation"]`);
    $(controlIcons[0]).remove();
  }
});
