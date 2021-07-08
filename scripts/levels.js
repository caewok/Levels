class Levels {
  constructor() {
    this.DEBUG = false;
    this.RAYS = game.settings.get(_levelsModuleName, "debugRaycast");
    this.CONSTS = {};
    this.CONSTS.COLLISIONTYPE = {
      sight: 0,
      collision: 1,
    };
    this.floorContainer = new PIXI.Container();
    this.floorContainer.spriteIndex = {};
    this.overContainer = new PIXI.Container();
    this.overContainer.spriteIndex = {};
    this.fogContainer = new PIXI.Container();
    this.fogContainer.spriteIndex = {};
    this.occlusionIndex = {};
    this.lastReleasedToken = undefined;
    this.levelsTiles = [];
    this.levelsHoles = [];
    this.levelsTokens = {};
    this.fogHiding = game.settings.get(_levelsModuleName, "fogHiding");
    this.elevationScale = game.settings.get(
      _levelsModuleName,
      "tokenElevScale"
    );
    this.defaultTokenHeight = game.settings.get(
      _levelsModuleName,
      "defaultLosHeight"
    );
    this.advancedLOS = true;
    this.preciseLightOcclusion = game.settings.get(
      _levelsModuleName,
      "preciseLightOcclusion"
    );
    this.preciseTokenVisibility = game.settings.get(
      _levelsModuleName,
      "preciseTokenVisibility"
    );
    this.autoLOSHeight = game.settings.get(_levelsModuleName, "autoLOSHeight");
    this.UI = game.user.isGM ? new LevelsUI() : undefined;
  }

  /**********************************************
   * INITIALIZE LEVELS FOR THE FIRST TIME *
   **********************************************/

  static get() {
    Levels._instance = new Levels();
    Levels._instance.floorContainer.sortableChildren = true;
    canvas.background.addChild(Levels._instance.floorContainer);
    canvas.foreground.addChild(Levels._instance.overContainer);
    canvas.sight.explored.addChild(Levels._instance.fogContainer);
    canvas["levelsLayer"] = new CanvasLayer();
    if (this.UI) Levels._instance.UI.readLevels();
    return Levels._instance;
  }

  getTileBoundingBox(tile) {
    let tileZZ = {
      x: tile.center.x - tile.width / 2,
      y: tile.center.y - tile.height / 2,
    };
    let tileCorners = [
      { x: tileZZ.x, y: tileZZ.y }, //tl
      { x: tileZZ.x + tile.width, y: tileZZ.y }, //tr
      { x: tileZZ.x + tile.width, y: tileZZ.y + tile.height }, //br
      { x: tileZZ.x, y: tileZZ.y + tile.height }, //bl
    ];
    return new PIXI.Polygon(tileCorners);
  }

  findRoomsTiles(token, allTiles) {
    let tiles = [];
    for (let tile of allTiles) {
      if (tile.poly && tile.poly.contains(token.center.x, token.center.y)) {
        let range = tile.range;
        tiles.push({
          tile: tile.tile,
          poly: tile.roomPoly,
          range: range,
        });
      }
    }
    return tiles;
  }

  findCurrentFloorForElevation(elevation, floors) {
    floors.forEach((floor) => {
      if (elevation <= floor.range[1] && elevation >= floor.range[0])
        return floor.range;
    });
    return false;
  }

  findAllTiles() {
    let tiles = [];
    for (let tile of canvas.foreground.placeables) {
      if (tile.data.hidden) continue;
      if (tile.roomPoly) {
        let {
          rangeBottom,
          rangeTop,
          isLevel,
          showIfAbove,
          isBasement,
          showAboveRange,
          noFogHide,
        } = this.getFlagsForObject(tile);
        if (!rangeBottom && rangeBottom != 0) continue;
        tile.isLevel = isLevel;
        tiles.push({
          tile: tile,
          poly: tile.roomPoly,
          range: [rangeBottom, rangeTop],
          showIfAbove: showIfAbove,
          isBasement: isBasement,
          showAboveRange: showAboveRange,
          noFogHide: noFogHide,
        });
      } else {
        let {
          rangeBottom,
          rangeTop,
          isLevel,
          showIfAbove,
          isBasement,
          showAboveRange,
          noFogHide,
        } = this.getFlagsForObject(tile);
        if (!rangeBottom && rangeBottom != 0) continue;
        tile.isLevel = isLevel;
        let tileZZ = {
          x: tile.center.x - tile.width / 2,
          y: tile.center.y - tile.height / 2,
        };
        let tileCorners = [
          { x: tileZZ.x, y: tileZZ.y }, //tl
          { x: tileZZ.x + tile.width, y: tileZZ.y }, //tr
          { x: tileZZ.x + tile.width, y: tileZZ.y + tile.height }, //br
          { x: tileZZ.x, y: tileZZ.y + tile.height }, //bl
        ];
        tiles.push({
          tile: tile,
          poly: new PIXI.Polygon(tileCorners),
          range: [rangeBottom, rangeTop],
          levelsOverhead: true,
          showIfAbove: showIfAbove,
          isBasement: isBasement,
          showAboveRange: showAboveRange,
          noFogHide: noFogHide,
        });
      }
    }
    this.levelsTiles = tiles;
    return tiles;
  }

  computeTile(tile, altitude, lights) {
    //Declare constants

    const cToken = canvas.tokens.controlled[0] || _levels.lastReleasedToken;
    const cTokenElev = cToken.data.elevation;

    //If a tile is not a roof and it's not set to show if it's above, hide it

    if (tile.range[1] != Infinity && !tile.showIfAbove)
      tile.tile.visible = false;

    //If a tile is a roof, hide it if the token is underground, otherwise show it

    if (tile.range[1] == Infinity) {
      if (cTokenElev < 0) {
        tile.tile.visible = false;
        tile.tile.isLevel = true;
      } else {
        if (altitude == 1) {
          tile.tile.visible = true;
          tile.tile.isLevel = false;
        } else {
          tile.tile.visible = false;
          tile.tile.isLevel = true;
        }
      }
    }

    //Compute the visibility of show if it's above tiles separately as they are a special case

    if (tile.showIfAbove && tile.range[1] != Infinity && altitude == 1) {
      if (tile.range[0] - cTokenElev <= tile.showAboveRange) {
        tile.tile.isLevel = true;
        tile.tile.visible = true;
      } else {
        tile.tile.visible = false;
        tile.tile.isLevel = true;
      }
    } else if (tile.showIfAbove && tile.range[1] != Infinity && altitude != 1) {
      tile.tile.visible = false;
      tile.tile.isLevel = true;
    }

    //If a tile is set as levelsOveerhead  hide it

    if (tile.levelsOverhead) tile.tile.visible = false;

    //Compute the tile mirroring in the background

    switch (altitude) {
      case 1: // If the tile is above the token, remove it from the stack
        this.removeTempTile(tile);
        return false;
        break;
      case -1: //If a tile is below a token render it in the stack unless the user specified otherwise with isBsement, in wich case add it to the stack only if the token is below ground
        if (tile.isBasement && cTokenElev >= 0) {
          this.removeTempTile(tile);
        } else {
          this.mirrorTileInBackground(tile);
        }
        return false;
        break;
      case 0: //If the tile is on the same level as the token, If the tile is set as overhead tile within a level, set it to visible and remove that tile from the stack, otherwise, add it to the stack
        if (!tile.levelsOverhead) {
          this.mirrorTileInBackground(tile, true);
        } else {
          tile.tile.visible = true;
          this.removeTempTile(tile);
        }
        return tile;
        break;
    }
  }

  checkTile(tile, altitude) {
    switch (altitude) {
      case 1:
        return false;
        break;
      case -1:
        return false;
        break;
      case 0:
        return tile;
        break;
    }
  }

  refreshTokens(overrideToken = undefined, release = false) {
    if (!release) {
      this.advancedLosTokenRefresh();
      return;
    }
    let cToken = overrideToken || canvas.tokens.controlled[0];
    if (!cToken) return;
    let allTiles = this.findAllTiles();
    let holes = this.getHoles();
    let tokensState = this.getTokensState(allTiles);
    let tokenPov = this.computeTokens(
      tokensState,
      cToken.data.elevation,
      holes,
      cToken.data.elevation,
      cToken.id
    );
    return tokenPov;
  }

  computeTokens(tokens, elevation, holes, cTokenElev, ctokenId) {
    let tokenPov = [];
    tokens.forEach((t) => {
      if (t.token.id != ctokenId && !t.token.data.hidden) {
        if (!(t.range[1] >= elevation && t.range[0] <= elevation)) {
          let isInHole = this.isTokenInHole(t, holes);
          if (!this.isInsideHoleRange(isInHole, t, cTokenElev)) {
            t.token.levelsHidden = true;
            t.token.icon.alpha = 0;
            tokenPov.push({ token: t, visible: t.token.isVisible });
            this.getTokenIconSprite(t.token);
          } else {
            t.token.visible = false;
            tokenPov.push({ token: t, visible: false });
            this.removeTempToken(t.token);
          }
        } else {
          t.token.levelsHidden = false;
          if (t.token.icon) t.token.icon.alpha = 1;
          tokenPov.push({ token: t, visible: t.token.isVisible });
          this.removeTempToken(t.token);
        }
      }
    });
    return tokenPov;
  }

  advancedLosTokenRefresh() {
    this.getHoles();
    this.getTokensState(this.levelsTiles);
  }

  advancedLosTestVisibility(sourceToken, token) {
    if (canvas.scene.data.tokenVision === false) return true;
    const gm = game.user.isGM;
    if (token._controlled) return true;
    if (!sourceToken.data.vision) return gm;
    const inLOS = !this.advancedLosTestInLos(sourceToken, token);
    const inRange = this.tokenInRange(sourceToken, token);
    if (inLOS && inRange && token.data.hidden && gm) return true;
    if (inLOS && inRange && !token.data.hidden) return true;
    const inLight = this.advancedLOSCheckInLight(token);
    if (inLOS && inLight && !token.data.hidden) return true;
    return false;
  }

  advancedLosTestInLos(sourceToken, token) {
    const tol = 4;
    if (this.preciseTokenVisibility === false)
      return this.checkCollision(sourceToken, token, "sight");
    const targetLOSH = this.getTokenLOSheight(token);
    const sourceCenter = {
      x: sourceToken.center.x,
      y: sourceToken.center.y,
      z: this.getTokenLOSheight(sourceToken),
    };
    const tokenCorners = [
      { x: token.center.x, y: token.center.y, z: targetLOSH },
      { x: token.x + tol, y: token.y + tol, z: targetLOSH },
      { x: token.x + token.w - tol, y: token.y + tol, z: targetLOSH },
      { x: token.x + tol, y: token.y + token.h - tol, z: targetLOSH },
      { x: token.x + token.w - tol, y: token.y + token.h - tol, z: targetLOSH },
    ];
    for (let point of tokenCorners) {
      let collision = this.testCollision(sourceCenter, point, "sight");
      if (!collision) return collision;
    }
    return true;
  }

  advancedLOSCheckInLight(token) {
    for (let source of canvas.lighting.sources) {
      if (source.skipRender) continue;
      if (source.object.document.documentName === "Token") {
        const lightRadius = Math.max(
          source.object.data.dimLight,
          source.object.data.brightLight
        );
        const lightTop = source.object.data.elevation + lightRadius ?? Infinity;
        const lightBottom =
          source.object.data.elevation - lightRadius ?? -Infinity;
        if (
          token.data.elevation >= lightBottom &&
          token.data.elevation <= lightTop
        ) {
          if (source.fov.contains(token.center.x, token.center.y)) return true;
        }
      } else {
        const lightTop = source.object.data.flags.levels?.rangeTop ?? Infinity;
        const lightBottom =
          source.object.data.flags.levels?.rangeBottom ?? -Infinity;
        if (
          token.data.elevation >= lightBottom &&
          token.data.elevation <= lightTop
        ) {
          if (source.fov.contains(token.center.x, token.center.y)) return true;
        }
      }
    }
    return false;
  }

  compute3DCollisionsForToken(sourceToken) {
    if (!sourceToken) return;
    //this.advancedLosTokenRefresh();
    for (let token of canvas.tokens.placeables) {
      if (token.data.hidden) token.levelsVisible = undefined;
      if (
        token == sourceToken ||
        (!game.user.isGM &&
          token.actor &&
          token.actor.testUserPermission(game.user, 2)) ||
        token.data.hidden
      )
        continue;
      token.visible = this.advancedLosTestVisibility(sourceToken, token);
      token.levelsVisible = token.visible;
      if (
        //this.levelsTokens[token.id].range[1] == Infinity ||
        token.data.elevation > sourceToken.data.elevation &&
        token.visible &&
        !token.data.hidden
      ) {
        this.getTokenIconSpriteOverhead(token);
      } else {
        this.removeTempTokenOverhead(token);
      }
      if (
        token.visible &&
        !token.data.hidden &&
        token.data.elevation < sourceToken.data.elevation
      ) {
        token.icon.alpha = 0;
        token.levelsHidden = true;
        this.getTokenIconSprite(token);
      } else {
        token.icon.alpha = 1;
        token.levelsHidden = false;
        this.removeTempToken(token);
      }
    }
  }

  tokenInRange(sourceToken, token) {
    const dist = this.getUnitTokenDist(sourceToken, token);
    const range = canvas.lighting.globalLight
      ? Infinity
      : Math.max(
          sourceToken.data.dimSight,
          sourceToken.data.brightSight,
          sourceToken.data.dimLight,
          sourceToken.data.brightLight
        );
    return dist <= range;
  }

  isInsideHoleRange(isInHole, t, cTokenElev) {
    return (
      !isInHole ||
      (t.token.data.elevation <= isInHole.range[1] &&
        t.token.data.elevation >= isInHole.range[0] &&
        !(cTokenElev <= isInHole.range[1] && cTokenElev >= isInHole.range[0]))
    );
  }

  isTokenInHole(t, holes) {
    let th = t.token.height;
    let tw = t.token.width;
    for (let hole of holes) {
      if (
        t.range[1] <= hole.range[1] &&
        t.range[0] >= hole.range[0] &&
        (hole.poly.contains(t.token.center.x, t.token.center.y) ||
          hole.poly.contains(t.token.x + tw, t.token.y) ||
          hole.poly.contains(t.token.x, t.token.y + th) ||
          hole.poly.contains(t.token.x + tw, t.token.y + th) ||
          hole.poly.contains(t.token.x, t.token.y))
      ) {
        return hole;
      }
    }
    return false;
  }

  getTokensState(allTiles) {
    let tokensState = [];
    this.levelsTokens = {};
    for (let token of canvas.tokens.placeables) {
      let tokenstate = this.getTokenState(token, allTiles);
      tokensState.push(tokenstate);
      this.levelsTokens[token.id] = tokenstate;
    }
    return tokensState;
  }

  getTokenState(token, allTiles) {
    let elevation = token.data.elevation;
    let tilesIsIn = this.findRoomsTiles(token, allTiles);
    if (!tilesIsIn || tilesIsIn.length == 0) {
      return { token: token, range: [-Infinity, Infinity] }; //return { token: token, range: [0, elevation] };
    }
    let levelTile;
    tilesIsIn.forEach((t) => {
      let isInLevel = this.checkTile(
        t,
        this.getPositionRelativeToTile(elevation, t)
      );
      if (isInLevel) levelTile = isInLevel;
    });
    if (levelTile) {
      return { token: token, range: levelTile.range };
    } else {
      levelTile = this.findCeiling(tilesIsIn);
      return { token: token, range: [0, levelTile.range[0] - 1] };
    }
  }

  mirrorTileInBackground(tileIndex, hideFog = false) {
    let tile = tileIndex.tile;
    let oldSprite = this.floorContainer.children.find((c) => c.name == tile.id);
    let tileImg = tile.children[0];
    if (!tileImg || oldSprite || !tileImg.texture.baseTexture) return;
    let sprite = new PIXI.Sprite.from(tileImg.texture);
    sprite.isSprite = true;
    sprite.width = tile.data.width;
    sprite.height = tile.data.height;
    sprite.position = tile.position;
    sprite.position.x += tileImg.x;
    sprite.position.y += tileImg.y;
    sprite.anchor = tileImg.anchor;
    sprite.angle = tileImg.angle;
    sprite.alpha = tile.data.alpha ?? 1;
    sprite.tint = tile.data.tint
      ? foundry.utils.colorStringToHex(tile.data.tint)
      : 0xffffff;
    sprite.name = tile.id;
    sprite.zIndex = tileIndex.levelsOverhead
      ? tileIndex.range[0] + 2
      : tileIndex.range[0];
    this.floorContainer.spriteIndex[tile.id] = sprite;
    this.floorContainer.addChild(sprite);
    if (hideFog && this.fogHiding) this.obscureFogForTile(tileIndex);
  }

  removeTempTile(tileIndex) {
    let tile = tileIndex.tile;
    let sprite = this.floorContainer.children.find((c) => c.name == tile.id);
    if (sprite) this.floorContainer.removeChild(sprite);
    this.clearFogForTile(tileIndex);
  }

  obscureFogForTile(tileIndex) {
    if (tileIndex.noFogHide === true) return;
    let tile = tileIndex.tile;
    let oldSprite = this.fogContainer.children.find((c) => c.name == tile.id);
    let tileImg = tile.children[0];
    if (!tileImg || oldSprite || !tileImg.texture.baseTexture) return;
    let sprite = new PIXI.Sprite.from(tileImg.texture);
    sprite.isSprite = true;
    sprite.width = tile.data.width;
    sprite.height = tile.data.height;
    sprite.position = tile.position;
    sprite.position.x += tileImg.x;
    sprite.position.y += tileImg.y;
    sprite.anchor = tileImg.anchor;
    sprite.angle = tileImg.angle;
    sprite.alpha = 1;
    sprite.name = tile.id;
    sprite.zIndex = tileIndex.range[0];
    sprite.tint = 0x000000;
    this.fogContainer.spriteIndex[tile.id] = sprite;
    this.fogContainer.addChild(sprite);
  }

  clearFogForTile(tileIndex) {
    if (!this.fogHiding) return;
    let tile = tileIndex.tile;
    let sprite = this.fogContainer.children.find((c) => c.name == tile.id);
    if (sprite) this.fogContainer.removeChild(sprite);
  }

  _onElevationChangeUpdate(overrideElevation = undefined) {
    if (!this.init) this._levelsOnSightRefresh();
    let perfEnd, perfStart;
    if (_levels.DEBUG) perfStart = performance.now();
    let cToken = overrideElevation || canvas.tokens.controlled[0];
    if (!cToken) return;
    this.removeTempTokenOverhead(cToken);
    this.removeTempToken(cToken);
    let allTiles = this.findAllTiles();
    let holes = this.getHoles();
    this.getTokensState(allTiles);
    if (this.elevationScale) this.updateScales();
    this.computeSounds(cToken);
    this.computeNotes(cToken);
    this.computeDrawings(cToken);
    let tilesIsIn = this.findRoomsTiles(cToken, allTiles);
    let lights = this.getLights();
    this.clearLights(lights);
    allTiles.forEach((tile) => {
      this.computeLightsForTile(tile, lights, cToken.data.elevation, holes);
      this.computeTile(
        tile,
        this.getPositionRelativeToTile(cToken.data.elevation, tile),
        lights
      );
    });
    tilesIsIn.forEach((tile) => {
      this.computeLightsForTile(tile, lights, cToken.data.elevation, holes);
    });
    lights.forEach(
      (lightIndex) => (lightIndex.light.source.skipAlreadyComputed = false)
    );
    if (_levels.DEBUG) {
      perfEnd = performance.now();
      console.log(
        `Levels _onElevationChangeUpdate took ${
          perfEnd - perfStart
        } ms, FPS:${Math.round(canvas.app.ticker.FPS)}, Tiles: `,
        allTiles,
        `Lights: `,
        lights,
        `Holes: `,
        holes
      );
    }
    canvas.lighting.refresh();
    canvas.lighting.placeables.forEach((l) => l.updateSource());
  }

  _levelsOnSightRefresh() {
    let perfStart, perfEnd;
    if (this.DEBUG) perfStart = performance.now();
    let cToken = canvas.tokens.controlled[0] || _levels.lastReleasedToken;
    this.debounce3DRefresh(32);
    this.computeDoors(cToken);
    if (!canvas.tokens.controlled[0] && !game.user.isGM) {
      let ownedTokens = canvas.tokens.placeables.filter(
        (t) => t.actor && t.actor.testUserPermission(game.user, 2)
      );
      let tokenPovs = [];
      ownedTokens.forEach((t) => {
        tokenPovs.push(this.refreshTokens(t, true));
        this.computeDoors(t);
      });
      tokenPovs.forEach((povs) => {
        povs.forEach((pov) => {
          if (pov.visible) {
            pov.token.token.visible = true;
            pov.token.token.icon.alpha = 1;
          }
        });
      });
      this.showOwnedTokensForPlayer();
    }

    if (!canvas.tokens.controlled[0] && !game.user.isGM) {
      this.showOwnedTokensForPlayer();
    }

    if (this.DEBUG) {
      perfEnd = performance.now();
      console.log(
        `_levelsOnSightRefresh took ${perfEnd - perfStart} ms, FPS:${Math.round(
          canvas.app.ticker.FPS
        )}`
      );
    }
  }

  computeTemplates(source) {
    if (!source) return;
    let tokenpos = {
      x: source.center.x,
      y: source.center.y,
      z: this.getTokenLOSheight(source),
    };
    for (let template of canvas.templates.placeables) {
      let templatepos = {
        x: template.center.x,
        y: template.center.y,
        z: template.document.getFlag(_levelsModuleName, "elevation") ?? 0,
      };
      template.visible = !this.testCollision(tokenpos, templatepos, "sight");
      canvas.grid.getHighlightLayer(`Template.${template.id}`).visible =
        template.visible;
    }
  }

  showTemplatesForGM() {
    for (let template of canvas.templates.placeables) {
      template.visible = true;
    }
  }

  updateScales() {
    if (this.elevationScale) {
      canvas.tokens.placeables.forEach((token) => {
        let elevScaleFactor = 1;
        if (canvas.tokens.controlled[0]) {
          let HeightDiff = Math.abs(
            token.data.elevation - canvas.tokens.controlled[0].data.elevation
          );
          if (HeightDiff === 0) HeightDiff = 1;
          let HeightDiffFactor = Math.sqrt(HeightDiff / 8);
          elevScaleFactor = 1 / HeightDiffFactor > 1 ? 1 : 1 / HeightDiffFactor;
          token.elevationScaleFactor =
            token.id != canvas.tokens.controlled[0].id ? elevScaleFactor : 1;
        }
        token.refresh();
      });
    } else {
      canvas.tokens.placeables.forEach((token) => {
        token.elevationScaleFactor = 1;
        token.refresh();
      });
    }
  }

  clearLights(lights) {
    lights.forEach((lightIndex) => {
      lightIndex.light.source.skipRender = false;
    });
  }

  debounce3DRefresh(timeout) {
    if (!this.updateQueued) {
      this.updateQueued = true;
      setTimeout(() => {
        let cToken = canvas.tokens.controlled[0] || _levels.lastReleasedToken;
        this.compute3DCollisionsForToken(cToken);
        this.computeTemplates(cToken);
        this.updateQueued = false;
      }, timeout);
    }
  }

  debounceElevationChange(timeout) {
    if (!this.updateQueued) {
      this.elevUpdateQueued = true;
      setTimeout(() => {
        this._onElevationChangeUpdate();
        this.elevUpdateQueued = false;
      }, timeout);
    }
  }

  computeLightsForTile(tile, lights, elevation, holes) {
    let lightsToOcclude = [];
    let lightsToUnocclude = [];
    lights.forEach((lightIndex) => {
      let whereIsTheLight = this.getLightPositionRelativeToTile(
        tile,
        lightIndex,
        elevation,
        holes
      );
      switch (whereIsTheLight) {
        case -1:
          if (!lightIndex.light.source.skipAlreadyComputed) {
            lightIndex.light.source.skipRender = false;
            lightsToOcclude.push(lightIndex);
          }
          break;
        case 0:
          if (!lightIndex.light.source.skipAlreadyComputed) {
            lightIndex.light.source.skipRender = false;
            lightsToUnocclude.push(lightIndex);
          }
          break;
        case 1:
          lightIndex.light.source.skipAlreadyComputed = true;
          lightIndex.light.source.skipRender = true;
          break;
      }
    });
    lights.forEach((light) => {
      this.unoccludeLights(tile, light);
    });
    lightsToOcclude.forEach((light) => {
      this.occludeLights(tile, light);
    });
    lightsToUnocclude.forEach((light) => {
      this.unoccludeLights(tile, light);
    });
  }

  /*****************************************************
   * 1: LIGHT IS ABOVE -1: LIGHT IS BELOW 0 : SAME LEVEL *
   *****************************************************/

  getLightPositionRelativeToTile(tile, light, elevation, holes) {
    //if(!tile.poly.contains(light.light.center.x,light.light.center.y)) return
    if (
      light.range[1] <= tile.range[1] &&
      !(elevation >= light.range[0] && elevation <= light.range[1]) &&
      elevation <= light.range[1]
    )
      return 1;
    if (
      light.range[0] >= tile.range[0] &&
      light.range[1] <= tile.range[1] &&
      elevation >= light.range[0] &&
      elevation <= light.range[1]
    )
      return 0;
    if (
      light.range[1] <= tile.range[0] &&
      elevation >= tile.range[0] &&
      elevation <= tile.range[1]
    ) {
      return this.lightIluminatesHole(light, holes, elevation) ? -1 : 1;
    }
  }

  lightIluminatesHole(light, holes, elevation) {
    if (!light.light.source.fov) return false;
    for (let hole of holes) {
      for (let i = 0; i < light.light.source.fov.points.length; i += 2) {
        if (
          elevation <= hole.range[1] &&
          elevation >= hole.range[0] &&
          hole.poly.contains(
            light.light.source.fov.points[i],
            light.light.source.fov.points[i + 1]
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  occludeLights(tileIndex, light) {
    let tile = tileIndex.tile;
    let oldSprite = light.light.source.coloration.children.find(
      (c) => c.name == tile.id
    );
    let addChild = oldSprite ? false : true;
    let tileImg = tile.children[0];
    if (!tileImg || !tileImg.texture.baseTexture) return;
    let sprite, Illumsprite;
    if (this.preciseLightOcclusion) {
      if (!tile._levelsAlphaMap)
        this._createAlphaMap(tile, { keepPixels: true, keepTexture: true });
      sprite = this.getLightOcclusionSprite(tile); //this.getTileSprite(undefined, tileImg, tile);
      sprite.tint = 0x000000;
      sprite.name = tile.id;
      Illumsprite = this.getLightOcclusionSprite(tile); //this.getTileSprite(undefined, tileImg, tile);
      Illumsprite.tint = canvas.lighting.channels.background.hex;
      Illumsprite.name = tile.id;
      if (addChild) {
        light.light.source.coloration.addChild(sprite);
        light.light.source.illumination.addChild(Illumsprite);
      }
    } else {
      sprite = this.getTileSprite(undefined, tileImg, tile);
      sprite.tint = 0x000000;
      Illumsprite = this.getTileSprite(undefined, tileImg, tile);
      Illumsprite.tint = canvas.lighting.channels.bright.hex;
      if (addChild) {
        light.light.source.coloration.addChild(sprite);
        light.light.source.illumination.addChild(Illumsprite);
      }
    }
  }

  getLightOcclusionSprite(tile) {
    if (!tile._levelsAlphaMap.texture) return undefined;
    const s = new PIXI.Sprite(tile._levelsAlphaMap.texture);
    const t = tile.tile;
    s.width = t.width;
    s.height = t.height;
    s.anchor.set(0.5, 0.5);
    s.position.set(tile.data.x + t.position.x, tile.data.y + t.position.y);
    s.rotation = t.rotation;
    return s;
  }

  _createAlphaMap(tile, { keepPixels = false, keepTexture = false } = {}) {
    // Destroy the previous texture
    if (tile._levelsAlphaMap?.texture) {
      tile._levelsAlphaMap.texture.destroy(true);
      delete tile._levelsAlphaMap.texture;
    }

    // If no tile texture is present
    const aw = Math.abs(tile.data.width);
    const ah = Math.abs(tile.data.height);
    if (!tile.texture)
      return (tile._levelsAlphaMap = { minX: 0, minY: 0, maxX: aw, maxY: ah });

    // Create a temporary Sprite
    const sprite = new PIXI.Sprite(tile.texture);
    sprite.width = tile.data.width;
    sprite.height = tile.data.height;
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(aw / 2, ah / 2);

    // Color matrix filter the sprite to pure white
    const cmf = new PIXI.filters.ColorMatrixFilter();
    cmf.matrix = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]; // Over-multiply alpha to remove transparency
    sprite.filters = [cmf];

    // Render to a texture and extract pixels
    const tex = PIXI.RenderTexture.create({ width: aw, height: ah });
    canvas.app.renderer.render(sprite, tex);
    const pixels = canvas.app.renderer.extract.pixels(tex);

    // Construct an alpha mapping
    const map = {
      pixels: new Uint8Array(pixels.length / 4),
      texture: undefined,
      minX: undefined,
      minY: undefined,
      maxX: undefined,
      maxY: undefined,
    };

    // Keep the texture?
    if (keepTexture) map.texture = tex;
    else tex.destroy(true);

    // Map the alpha pixels
    for (let i = 0; i < pixels.length; i += 4) {
      const n = i / 4;
      const a = pixels[i + 3];
      map.pixels[n] = a > 0 ? 1 : 0;
      if (a > 0) {
        const x = n % aw;
        const y = Math.floor(n / aw);
        if (map.minX === undefined || x < map.minX) map.minX = x;
        else if (map.maxX === undefined || x > map.maxX) map.maxX = x;
        if (map.minY === undefined || y < map.minY) map.minY = y;
        else if (map.maxY === undefined || y > map.maxY) map.maxY = y;
      }
    }

    // Maybe discard the raw pixels
    if (!keepPixels) map.pixels = undefined;
    return (tile._levelsAlphaMap = map);
  }

  getTileSprite(oldSprite, tileImg, tile) {
    let sprite = oldSprite || new PIXI.Sprite.from(tileImg.texture);
    sprite.isSprite = true;
    sprite.width = tile.data.width;
    sprite.height = tile.data.height;
    sprite.position = tile.position;
    sprite.position.x += tileImg.x;
    sprite.position.y += tileImg.y;
    sprite.anchor = tileImg.anchor;
    sprite.angle = tileImg.angle;
    sprite.alpha = 1;
    sprite.name = tile.id;
    return sprite;
  }

  unoccludeLights(tileIndex, light, justTile = false) {
    let tile = !justTile ? tileIndex.tile : tileIndex;
    let sprite = light.light.source.coloration.children.find(
      (c) => c.name == tile.id
    );
    let illumSprite = light.light.source.illumination.children.find(
      (c) => c.name == tile.id
    );
    //if(!sprite) return
    light.light.source.coloration.removeChild(sprite);
    light.light.source.illumination.removeChild(illumSprite);
  }

  hideLighs(tileIndex, lights) {
    if (!this.occlusionIndex["HideMask"]) {
      let g = new PIXI.Graphics();
      g.beginFill().drawRect(
        0,
        0,
        canvas.dimensions.width,
        canvas.dimensions.height
      );
      let tex = canvas.app.renderer.generateTexture(g);
      let p = new PIXI.Sprite.from(tex);
      p.tint = 0x000000;
      this.occlusionIndex["HideMask"] = p;
    }
    lights.forEach((lightIndex) => {
      lightIndex.light.source.coloration.addChild(
        this.occlusionIndex["HideMask"]
      );
      //lightIndex.light.source.illumination.addChild(this.occlusionIndex["HideMask"]);
    });
  }

  getTokensInBuilding(poly) {
    let tokensInBuilding = [];
    canvas.tokens.placeables.forEach((t) => {
      if (poly.contains(t.center.x, t.center.y)) tokensInBuilding.push(t);
    });
    return tokensInBuilding;
  }

  findCeiling(tiles) {
    let arrayToReduce = [];
    tiles.forEach((t) => {
      arrayToReduce.push({ c: t.range[0], t: t });
      arrayToReduce.push({ c: t.range[1], t: t });
    });
    const reducer = (previousC, currentC) => {
      return previousC.c < currentC.c ? previousC : currentC;
    };
    return arrayToReduce.reduce(reducer).t;
  }

  getHoles() {
    let holes = [];
    canvas.drawings.placeables.forEach((drawing) => {
      let { rangeBottom, rangeTop, drawingMode } =
        this.getFlagsForObject(drawing);
      if (drawingMode == 1 && (rangeBottom || rangeBottom == 0)) {
        let p = new PIXI.Polygon(this.adjustPolygonPoints(drawing));
        holes.push({
          poly: p,
          range: [rangeBottom, rangeTop],
        });
      }
    });
    this.levelsHoles = holes;
    return holes;
  }

  getStairs() {
    let holes = [];
    canvas.drawings.placeables.forEach((drawing) => {
      let { rangeBottom, rangeTop, drawingMode } =
        this.getFlagsForObject(drawing);
      let isLocked = drawing.document.getFlag(_levelsModuleName, "stairLocked");
      if (
        (drawingMode == 2 || drawingMode == 3) &&
        rangeBottom != -Infinity &&
        rangeTop != Infinity &&
        !isLocked
      ) {
        let p = new PIXI.Polygon(this.adjustPolygonPoints(drawing));
        holes.push({
          drawing: drawing,
          poly: p,
          range: [rangeBottom, rangeTop + 1],
          drawingMode: drawingMode,
        });
      }
    });
    return holes;
  }

  executeStairs(updates, token) {
    if ("x" in updates || "y" in updates) {
      let stairs = _levels.getStairs();
      let tokenX = updates.x || token.data.x;
      let tokenY = updates.y || token.data.y;
      let newUpdates;
      let tokenElev = updates.elevation || token.data.elevation;
      let gridSize = canvas.scene.dimensions.size;
      let newTokenCenter = {
        x: tokenX + (gridSize * token.data.width) / 2,
        y: tokenY + (gridSize * token.data.height) / 2,
      };
      let inStair;
      for (let stair of stairs) {
        if (stair.poly.contains(newTokenCenter.x, newTokenCenter.y)) {
          if (token.inStair == stair.drawing.id) {
            inStair = stair.drawing.id;
          } else {
            if (stair.drawingMode == 2) {
              if (tokenElev <= stair.range[1] && tokenElev >= stair.range[0]) {
                if (tokenElev == stair.range[1]) {
                  inStair = stair.drawing.id;
                  newUpdates = { elevation: stair.range[0] };
                }
                if (tokenElev == stair.range[0]) {
                  inStair = stair.drawing.id;
                  newUpdates = { elevation: stair.range[1] };
                }
              }
            } else if (stair.drawingMode == 3) {
              if (tokenElev <= stair.range[1] && tokenElev >= stair.range[0]) {
                _levels.renderElevatorDalog(
                  stair.drawing.document.getFlag(
                    _levelsModuleName,
                    "elevatorFloors"
                  ),
                  token
                );
                inStair = stair.drawing.id;
              }
            }
          }
        } else {
          inStair = inStair || false;
        }
      }
      token.inStair = inStair;
      if (newUpdates) token.update(newUpdates);
    }
  }

  async renderElevatorDalog(levelsFlag) {
    let elevatorFloors = [];
    levelsFlag.split("|").forEach((f) => {
      elevatorFloors.push(f.split(","));
    });

    let content = `<div id="levels-elevator">`;

    elevatorFloors.forEach((f) => {
      content += `<div class="button">
      <button id="${f[0]}" class="elevator-level">${f[1]}</button>
    </div>`;
    });
    content += `<hr></div>`;

    let dialog = new Dialog({
      title: game.i18n.localize("levels.dialog.elevator.title"),
      content: content,
      buttons: {
        close: {
          label: game.i18n.localize("levels.yesnodialog.no"),
          callback: () => {},
        },
      },
      default: "close",
      close: () => {},
    });
    await dialog._render(true);
    let renderedFrom = $("body").find(`div[id="levels-elevator"]`);
    for (let btn of $(renderedFrom).find("button")) {
      $(btn).on("click", updateElev);
    }
    function updateElev(event) {
      let newElev = parseInt(event.target.id);
      if (newElev || newElev == 0)
        canvas.tokens.controlled[0].update({ elevation: newElev });
    }
  }

  getLights() {
    let lights = [];
    canvas.lighting.placeables.forEach((light) => {
      let { rangeBottom, rangeTop } = this.getFlagsForObject(light);
      if (rangeBottom || rangeBottom == 0) {
        lights.push({
          light: light,
          range: [rangeBottom, rangeTop],
        });
      }
    });
    canvas.tokens.placeables.forEach((token) => {
      if (
        (token.light.dim || token.light.bright) &&
        this.levelsTokens[token.id]
      ) {
        lights.push({
          light: { source: token.light },
          range: [
            this.levelsTokens[token.id].range[0],
            this.levelsTokens[token.id].range[1],
          ],
        });
      }
    });
    return lights;
  }

  computeSounds(cToken) {
    if (!cToken && !game.user.isGM) {
      for (let s of canvas.sounds.placeables) {
        s.levelsInaudible = false;
      }
      return;
    }

    if (!cToken) return;
    let tElev = cToken.data.elevation;
    for (let s of canvas.sounds.placeables) {
      let { rangeBottom, rangeTop } = this.getFlagsForObject(s);
      if (!rangeBottom && rangeBottom != 0) continue;
      if (!(tElev >= rangeBottom && tElev <= rangeTop)) {
        s.levelsInaudible = true;
      } else {
        s.levelsInaudible = false;
      }
    }
  }

  adjustPolygonPoints(drawing) {
    let globalPoints = [];
    if (drawing.data.points.length != 0) {
      drawing.data.points.forEach((p) => {
        globalPoints.push(p[0] + drawing.x, p[1] + drawing.y);
      });
    } else {
      globalPoints = [
        drawing.x,
        drawing.y,
        drawing.x + drawing.data.width,
        drawing.y,
        drawing.x + drawing.data.width,
        drawing.y + drawing.data.height,
        drawing.x,
        drawing.y + drawing.data.height,
      ];
    }
    return globalPoints;
  }

  getTokenIconSprite(token, x, y, rotate) {
    let oldSprite = this.floorContainer.children.find(
      (c) => c.name == token.id
    ); //this.floorContainer.spriteIndex[token.id];
    let icon = token.icon;
    if (token._controlled || !icon || !icon.texture.baseTexture) return;
    let sprite = this.getSpriteCopy(oldSprite, icon, token, x, y);
    if (!oldSprite) {
      this.floorContainer.spriteIndex[token.id] = sprite;
      this.floorContainer.addChild(sprite);
    }
  }

  getSpriteCopy(oldSprite, icon, token, x, y) {
    let sprite = oldSprite ? oldSprite : new PIXI.Sprite.from(icon.texture);
    sprite.isSprite = true;

    const tex = token.texture;
    if (tex) {
      let aspect = tex.width / tex.height;
      const scale = token.icon.scale;
      if (aspect >= 1) {
        sprite.width = token.w * token.data.scale;
        scale.y = Number(scale.x);
      } else {
        sprite.height = token.h * token.data.scale;
        scale.x = Number(scale.y);
      }
    }
    sprite.scale.x =
      Math.abs(icon.scale.x) *
      (token.data.mirrorX ? -1 : 1) *
      (token.elevationScaleFactor || 1);
    sprite.scale.y =
      Math.abs(icon.scale.y) *
      (token.data.mirrorY ? -1 : 1) *
      (token.elevationScaleFactor || 1);
    sprite.tint = token.data.tint
      ? foundry.utils.colorStringToHex(token.data.tint)
      : 0xffffff;
    sprite.position.x = x || token.position.x;
    sprite.position.y = y || token.position.y;
    sprite.position.x += icon.x;
    sprite.position.y += icon.y;
    sprite.anchor = icon.anchor;
    sprite.angle = icon.angle;
    sprite.alpha = token.visible ? 1 : 0;
    sprite.name = token.id;
    sprite.zIndex = token.data.elevation + 1;
    return sprite;
  }

  removeTempToken(token) {
    let sprite = this.floorContainer.children.find((c) => c.name == token.id);
    if (sprite) this.floorContainer.removeChild(sprite);
  }

  getTokenIconSpriteOverhead(token, x, y, rotate) {
    let oldSprite = this.overContainer.children.find((c) => c.name == token.id);
    let icon = token.icon;
    if (token._controlled || !icon || !icon.texture.baseTexture) return;
    let sprite = this.getSpriteCopy(oldSprite, icon, token, x, y);
    if (!oldSprite) {
      this.overContainer.spriteIndex[token.id] = sprite;
      this.overContainer.addChild(sprite);
    }
  }

  removeTempTokenOverhead(token) {
    let sprite = this.overContainer.children.find((c) => c.name == token.id);
    if (sprite) this.overContainer.removeChild(sprite);
  }

  getUnitTokenDist(token1, token2) {
    const unitsToPixel = canvas.dimensions.size / canvas.dimensions.distance;
    const x1 = token1.center.x;
    const y1 = token1.center.y;
    const z1 = this.getTokenLOSheight(token1) * unitsToPixel;
    const x2 = token2.center.x;
    const y2 = token2.center.y;
    const z2 = this.getTokenLOSheight(token2) * unitsToPixel;

    const d =
      Math.sqrt(
        Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2)
      ) / unitsToPixel;
    return d;
  }

  showOwnedTokensForPlayer() {
    canvas.tokens.placeables.forEach((t) => {
      if (t.actor.testUserPermission(game.user, 2)) {
        t.visible = true;
        t.icon.alpha = 1;
      }
    });
  }

  restoreGMvisibility() {
    let levelLigths = _levels.getLights();
    canvas.foreground.placeables.forEach((t) => {
      t.visible = true;
      _levels.removeTempTile(t);
      levelLigths.forEach((light) => {
        _levels.unoccludeLights(t, light, true);
      });
    });
    _levels.floorContainer.removeChildren();
    _levels.floorContainer.spriteIndex = {};
    canvas.tokens.placeables.forEach((t) => {
      if (t.levelsHidden == true) {
        t.levelsHidden == false;
        t.levelsVisible == true;
        t.icon.alpha = 1;
        _levels.removeTempToken(t);
        _levels.removeTempTokenOverhead(t);
      }
    });
    _levels.clearLights(_levels.getLights());
    this.showTemplatesForGM();
    canvas.drawings.placeables.forEach((d) => (d.visible = true));
  }

  /*****************************************************
   * 1: TILE IS ABOVE -1: TILE IS BELOW 0 : SAME LEVEL *
   *****************************************************/

  getPositionRelativeToTile(elevation, tile) {
    if (elevation < tile.range[0]) return 1;
    if (elevation > tile.range[1]) return -1;
    return 0;
  }

  getWallHeightRange(wall) {
    let wallRange = [
      wall.data.flags.wallHeight?.wallHeightBottom,
      wall.data.flags.wallHeight?.wallHeightTop,
    ];
    if (wallRange[0] === undefined || wallRange[0] === null)
      wallRange[0] = -Infinity;
    if (wallRange[1] === undefined || wallRange[1] === null)
      wallRange[1] = Infinity;
    if (!wallRange[0] && !wallRange[1]) return false;
    else return wallRange;
  }

  computeDoors(cToken) {
    if (!cToken && !game.user.isGM) {
      for (let d of canvas.controls.doors.children) {
        d.visible = false;
      }
      return;
    }

    if (!cToken) return;
    let tElev = cToken.data.elevation;
    for (let d of canvas.controls.doors.children) {
      let range = this.getWallHeightRange(d.wall);
      if (!range) continue;
      if (!(tElev >= range[0] && tElev < range[1])) {
        d.visible = false;
      }
    }
  }

  computeNotes(cToken) {
    if (!cToken || !canvas.notes.interactiveChildren) return;
    let tElev = cToken.data.elevation;
    for (let n of canvas.notes.placeables) {
      let { rangeBottom, rangeTop } = this.getFlagsForObject(n);
      if (!rangeBottom && rangeBottom != 0) continue;
      if (!(tElev >= rangeBottom && tElev <= rangeTop)) {
        n.visible = false;
      } else {
        n.visible = n.document.testUserPermission(game.user, 2);
      }
    }
  }

  hideNotes() {
    for (let n of canvas.notes.placeables) {
      let { rangeBottom, rangeTop } = this.getFlagsForObject(n);
      if (!rangeBottom && rangeBottom != 0) continue;
      n.visible = false;
    }
  }

  computeDrawings(cToken) {
    if (!cToken) return;
    let tElev = cToken.data.elevation;
    for (let d of canvas.drawings.placeables) {
      let { rangeBottom, rangeTop } = this.getFlagsForObject(d);
      if (!rangeBottom && rangeBottom != 0) continue;
      if (!(tElev >= rangeBottom && tElev <= rangeTop)) {
        d.visible = false;
      } else {
        d.visible = !d.data.hidden;
      }
    }
  }

  hideDrawings() {
    for (let d of canvas.drawings.placeables) {
      let { rangeBottom, rangeTop } = this.getFlagsForObject(d);
      if (!rangeBottom && rangeBottom != 0) continue;
      d.visible = false;
    }
  }

  async migrateFlags() {
    ui.notifications.error(
      `WARNING! Migrating Levels to new model please don't touch anything!`
    );
    let migrated = 0;
    async function migrateForObject(object) {
      let oldLevelsFlag = object.getFlag(_levelsModuleName, "heightRange");
      if (!oldLevelsFlag) return;
      let splitFlag = oldLevelsFlag.split(",");
      if (splitFlag.length != 2) {
        await object.unsetFlag(_levelsModuleName, "heightRange");
        return;
      }
      let range0 = parseInt(splitFlag[0]);
      let range1 =
        splitFlag[1].toLowerCase() == "infinity"
          ? Infinity
          : parseInt(splitFlag[1]);
      await object.setFlag(_levelsModuleName, "rangeBottom", range0);
      await object.setFlag(_levelsModuleName, "rangeTop", range1);
      await object.unsetFlag(_levelsModuleName, "heightRange");
      migrated++;
    }
    for (let scene of Array.from(game.scenes)) {
      for (let object of Array.from(scene.data.tiles)) {
        await migrateForObject(object);
      }
      for (let object of Array.from(scene.data.lights)) {
        await migrateForObject(object);
      }
      for (let object of Array.from(scene.data.drawings)) {
        await migrateForObject(object);
      }
    }

    ui.notifications.info(
      `Migration completed: Migrated ${migrated} Entities - You can disable migration on startup in the module settings. Remember to also Update Better Roofs`
    );
  }

  async elevationDialog(tool) {
    let content = `
    <div class="form-group">
    <label for="elevation">${game.i18n.localize(
      "levels.template.elevation.name"
    )}</label>
    <div class="form-fields">
        <input type="number" name="templateElevation" data-dtype="Number" value="${
          canvas.tokens.controlled[0]?.data?.elevation ?? 0
        }" step="1">
    </div>
    </div>
    <p></p>
    `;
    let ignoreClose = false;
    let toolhtml = $("body").find(`li[data-tool="setTemplateElevation"]`);
    let dialog = new Dialog({
      title: game.i18n.localize("levels.dialog.elevation.title"),
      content: content,
      buttons: {
        confirm: {
          label: game.i18n.localize("levels.yesnodialog.yes"),
          callback: (html) => {
            _levels.nextTemplateHeight = html.find(
              `input[name="templateElevation"]`
            )[0].valueAsNumber;
            _levels.templateElevation = true;
            ignoreClose = true;
            tool.active = true;
            if (toolhtml[0])
              $("body")
                .find(`li[data-tool="setTemplateElevation"]`)
                .addClass("active");
          },
        },
        close: {
          label: game.i18n.localize("levels.yesnodialog.no"),
          callback: () => {
            _levels.nextTemplateHeight = undefined;
            _levels.templateElevation = false;
            tool.active = false;
            if (toolhtml[0])
              $("body")
                .find(`li[data-tool="setTemplateElevation"]`)
                .removeClass("active");
          },
        },
      },
      default: "confirm",
      close: () => {
        if (ignoreClose == true) {
          ignoreClose = false;
          return;
        }
        _levels.nextTemplateHeight = undefined;
        _levels.templateElevation = false;
        tool.active = false;
        if (toolhtml[0])
          $("body")
            .find(`li[data-tool="setTemplateElevation"]`)
            .removeClass("active");
      },
    });
    await dialog._render(true);
  }

  raycastDebug() {
    if (_levels.RAYS && canvas.tokens.controlled[0]) {
      let oldcontainer = canvas.controls.debug.children.find(
        (c) => (c.name = "levelsRAYS")
      );
      if (oldcontainer) oldcontainer.clear();
      let g = oldcontainer || new PIXI.Graphics();
      g.name = "levelsRAYS";
      let ctk = canvas.tokens.controlled[0];
      canvas.tokens.placeables.forEach((t) => {
        if (this.preciseTokenVisibility === false) {
          let isCollision = _levels.checkCollision(ctk, t, "sight");
          let color = isCollision ? 0xff0000 : 0x00ff08;
          let coords = [ctk.center.x, ctk.center.y, t.center.x, t.center.y];
          if (ctk != t)
            g.beginFill(color)
              .lineStyle(1, color)
              .drawPolygon(coords)
              .endFill();
        } else {
          let targetLOSH = this.getTokenLOSheight(t);
          let tol = 4;
          let sourceCenter = {
            x: ctk.center.x,
            y: ctk.center.y,
            z: this.getTokenLOSheight(ctk),
          };
          let tokenCorners = [
            { x: t.center.x, y: t.center.y, z: targetLOSH },
            { x: t.x + tol, y: t.y + tol, z: targetLOSH },
            { x: t.x + t.w - tol, y: t.y + tol, z: targetLOSH },
            { x: t.x + tol, y: t.y + t.h - tol, z: targetLOSH },
            { x: t.x + t.w - tol, y: t.y + t.h - tol, z: targetLOSH },
          ];
          for (let point of tokenCorners) {
            let isCollision = this.testCollision(sourceCenter, point, "sight");
            let color = isCollision ? 0xff0000 : 0x00ff08;
            let coords = [ctk.center.x, ctk.center.y, point.x, point.y];
            if (ctk != t)
              g.beginFill(color)
                .lineStyle(1, color)
                .drawPolygon(coords)
                .endFill();
          }
        }
      });
      if (!oldcontainer) canvas.controls.debug.addChild(g);
    }
  }

  /*****************
   * API FUNCTIONS *
   *****************/

  /**
   * Get the floor and ceiling of one or multiple tokens.
   * @param {Object|Object[]|String|String[]} tokenIds - A Token, an Array of Tokens, a Token ID or an Array of Tokens IDs
   * @returns {Object|Object[]} - returns an object containing token as the token object and range as an Array with 0 = Floor 1 = Ceiling
   **/

  getTokens(tokenIds) {
    if (Array.isArray(tokenIds)) {
      let tokensState = {};
      tokenIds.forEach((token) => {
        let tId = token.id || token;
        tokensState[tId] = this.levelsTokens[tokenIds];
      });
      return tokensState;
    } else {
      let tId = tokenIds.id || tokenIds;
      return this.levelsTokens[tId];
    }
  }

  /**
   * Get the floor and ceiling of one tile\drawing\light\sound object.
   * @param {Object} object - A Tile, Drawing, Light or Sound object
   * @returns {rangeBottom, rangeTop, isLevel, drawingMode} returns variables containing the flags data
   **/

  getFlagsForObject(object) {
    let rangeTop = object.document.getFlag(_levelsModuleName, "rangeTop");
    let rangeBottom = object.document.getFlag(_levelsModuleName, "rangeBottom");
    if (!rangeTop && rangeTop != 0) rangeTop = Infinity;
    if (!rangeBottom && rangeBottom != 0) rangeBottom = -Infinity;
    let isLevel = rangeTop == Infinity ? false : true;
    if (
      rangeTop == Infinity &&
      canvas.tokens.controlled[0] &&
      canvas.tokens.controlled[0].data.elevation < 0
    )
      isLevel = true;
    if (rangeTop == Infinity && rangeBottom == -Infinity) return false;
    let drawingMode =
      object.document.getFlag(_levelsModuleName, "drawingMode") || 0;
    let showIfAbove = object.document.getFlag(_levelsModuleName, "showIfAbove");
    let isBasement = object.document.getFlag(_levelsModuleName, "isBasement");
    let noFogHide = object.document.getFlag(_levelsModuleName, "noFogHide");
    let showAboveRange = object.document.getFlag(
      _levelsModuleName,
      "showAboveRange"
    );
    if (showAboveRange == undefined || showAboveRange == null)
      showAboveRange = Infinity;

    return {
      rangeBottom,
      rangeTop,
      isLevel,
      drawingMode,
      showIfAbove,
      isBasement,
      showAboveRange,
      noFogHide,
    };
  }

  /**
   * Get all the levels a point is in
   * @param {Object} point - an object containing x and y coordinates {x:x,y:y}
   * @returns {Object[]} returns an array of object each containing {tile,range,poly}
   * where tile is the tile object, range is an array with [bottom,top] and poly is the polygon computed for the room
   **/

  getFloorsForPoint(point) {
    let cPoint = { center: { x: point.x, y: point.y } };
    return this.findRoomsTiles(cPoint, this.levelsTiles);
  }

  /**
   * Get all the levels a point is in
   * @param {Integer} elevation - an integer representing elevation
   * @param {Object[]} floors - an array of object each containing {tile,range,poly}
   * where tile is the tile object, range is an array with [bottom,top] and poly is the polygon computed for the room
   * @returns {Array|false} returns false if the elevation is not contained in any of the provided floors, return an Array with [bottom,top] if one is found
   **/

  findCurrentFloorForElevation(elevation, floors) {
    floors.forEach((floor) => {
      if (elevation <= floor.range[1] && elevation >= floor.range[0])
        return floor.range;
    });
    return false;
  }

  /**
   * Perform a collision test between 2 point in 3D space
   * @param {Object} p0 - a point in 3d space {x:x,y:y,z:z} where z is the elevation
   * @param {Object} p1 - a point in 3d space {x:x,y:y,z:z} where z is the elevation
   * @param {String} type - "sight" or "collision" (defaults to "sight")
   * @returns {Boolean} returns true if a collision is detected, flase if it's not
   **/

  testCollision(p0, p1, type = "sight") {
    //Declare points adjusted with token height to use in the loop
    const x0 = p0.x;
    const y0 = p0.y;
    const z0 = p0.z;
    const x1 = p1.x;
    const y1 = p1.y;
    const z1 = p1.z;
    const TYPE = this.CONSTS.COLLISIONTYPE[type];
    //If the point are on the same Z axis return the 3d wall test
    if (z0 == z1) {
      return walls3dTest();
    }

    //Loop through all the planes and check for both ceiling and floor collision on each tile
    for (let tile of this.levelsTiles) {
      if (tile.levelsOverhead) continue;
      const bottom = tile.range[0];
      const top = tile.range[1];
      if ((bottom && bottom != -Infinity) || bottom == 0) {
        const zIntersectionPoint = getPointForPlane(bottom);
        if (
          ((z0 < bottom && bottom < z1) || (z1 < bottom && bottom < z0)) &&
          tile.poly.contains(zIntersectionPoint.x, zIntersectionPoint.y)
        ) {
          if (checkForHole(zIntersectionPoint, bottom)) return true;
        }
      }
      if ((top && top != Infinity) || top == 0) {
        const zIntersectionPoint = getPointForPlane(top);
        if (
          ((z0 < top && top < z1) || (z1 < top && top < z0)) &&
          tile.poly.contains(zIntersectionPoint.x, zIntersectionPoint.y)
        ) {
          if (checkForHole(zIntersectionPoint, top)) return true;
        }
      }
    }

    //Return the 3d wall test if no collisions were detected on the Z plane
    return walls3dTest();

    //Get the intersection point between the ray and the Z plane
    function getPointForPlane(z) {
      const x = ((z - z0) * (x1 - x0) + x0 * z1 - x0 * z0) / (z1 - z0);
      const y = ((z - z0) * (y1 - y0) + z1 * y0 - z0 * y0) / (z1 - z0);
      const point = { x: x, y: y };
      return point;
    }
    //Check if a floor is hollowed by a hole
    function checkForHole(intersectionPT, zz) {
      for (let hole of _levels.levelsHoles) {
        const hbottom = hole.range[0];
        const htop = hole.range[1];
        if (zz > htop || zz < hbottom) continue;
        if (hole.poly.contains(intersectionPT.x, intersectionPT.y)) {
          return false;
        }
        if (hole.poly.contains(intersectionPT.x, intersectionPT.y)) {
          return false;
        }
      }
      return true;
    }
    //Check if a point in 2d space is betweeen 2 points
    function isBetween(a, b, c) {
      //test
      //return ((a.x<=c.x && c.x<=b.x && a.y<=c.y && c.y<=b.y) || (a.x>=c.x && c.x >=b.x && a.y>=c.y && c.y >=b.y))

      const dotproduct = (c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y);
      if (dotproduct < 0) return false;

      const squaredlengthba =
        (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
      if (dotproduct > squaredlengthba) return false;

      return true;
    }
    //Get wall heights flags, avoid infinity, use arbitrary large number instead
    function getWallHeightRange3Dcollision(wall) {
      let wallRange = [
        wall.data.flags.wallHeight?.wallHeightBottom,
        wall.data.flags.wallHeight?.wallHeightTop,
      ];
      if (wallRange[0] === undefined || wallRange[0] === null)
        wallRange[0] = -1000000000000;
      if (wallRange[1] === undefined || wallRange[1] === null)
        wallRange[1] = 1000000000000;
      if (!wallRange[0] && !wallRange[1]) return false;
      else return wallRange;
    }
    //Compute 3d collision for walls
    function walls3dTest() {
      for (let wall of canvas.walls.placeables) {
        //continue if we have to ignore the wall
        if (TYPE === 0) {
          //sight
          if (
            wall.data.sense === 0 ||
            (wall.data.door != 0 && wall.data.ds === 1)
          )
            continue;
        }
        if (TYPE === 1) {
          //collision
          if (
            wall.data.move === 0 ||
            (wall.data.door != 0 && wall.data.ds === 1)
          )
            continue;
        }
        //declare points in 3d space of the rectangle created by the wall
        const wallBotTop = getWallHeightRange3Dcollision(wall);
        const wx1 = wall.data.c[0];
        const wx2 = wall.data.c[2];
        const wx3 = wall.data.c[2];
        const wy1 = wall.data.c[1];
        const wy2 = wall.data.c[3];
        const wy3 = wall.data.c[3];
        const wz1 = wallBotTop[0];
        const wz2 = wallBotTop[0];
        const wz3 = wallBotTop[1];

        //calculate the parameters for the infinite plane the rectangle defines
        const A = wy1 * (wz2 - wz3) + wy2 * (wz3 - wz1) + wy3 * (wz1 - wz2);
        const B = wz1 * (wx2 - wx3) + wz2 * (wx3 - wx1) + wz3 * (wx1 - wx2);
        const C = wx1 * (wy2 - wy3) + wx2 * (wy3 - wy1) + wx3 * (wy1 - wy2);
        const D =
          -wx1 * (wy2 * wz3 - wy3 * wz2) -
          wx2 * (wy3 * wz1 - wy1 * wz3) -
          wx3 * (wy1 * wz2 - wy2 * wz1);

        //solve for p0 p1 to check if the points are on opposite sides of the plane or not
        const P1 = A * x0 + B * y0 + C * z0 + D;
        const P2 = A * x1 + B * y1 + C * z1 + D;

        //don't do anything else if the points are on the same side of the plane
        if (P1 * P2 > 0) continue;

        //Check for directional walls

        if (wall.direction !== null) {
          // Directional walls where the ray angle is not in the same hemisphere
          const rayAngle = Math.atan2(y1 - y0, x1 - x0);
          const angleBounds = [rayAngle - Math.PI / 2, rayAngle + Math.PI / 2];
          if (!wall.isDirectionBetweenAngles(...angleBounds)) continue;
        }

        //calculate intersection point
        const t =
          -(A * x0 + B * y0 + C * z0 + D) /
          (A * (x1 - x0) + B * (y1 - y0) + C * (z1 - z0)); //-(A*x0 + B*y0 + C*z0 + D) / (A*x1 + B*y1 + C*z1)
        const ix = x0 + (x1 - x0) * t;
        const iy = y0 + (y1 - y0) * t;
        const iz = Math.round(z0 + (z1 - z0) * t);

        //return true if the point is inisde the rectangle
        const isb = isBetween(
          { x: wx1, y: wy1 },
          { x: wx2, y: wy2 },
          { x: ix, y: iy }
        );
        if (isb && iz <= wallBotTop[1] && iz >= wallBotTop[0]) return true;
      }
      return false;
    }
  }

  /**
   * Get the total LOS height for a token
   * @param {Object} token - a token object
   * @returns {Integer} returns token elevation plus the LOS height stored in the flags
   **/

  getTokenLOSheight(token) {
    let losDiff;
    let divideBy = token.data.flags.levelsautocover?.ducking ? 3 : 1;
    if (this.autoLOSHeight) {
      losDiff =
        token.data.flags.levels?.tokenHeight ||
        canvas.scene.dimensions.distance *
          Math.max(token.data.width, token.data.height) *
          token.data.scale;
    } else {
      losDiff = token.data.flags.levels?.tokenHeight || this.defaultTokenHeight;
    }

    return token.data.elevation + losDiff / divideBy;
  }

  /**
   * Perform a collision test between 2 TOKENS in 3D space
   * @param {Object} token1 - a point in 3d space {x:x,y:y,z:z} where z is the elevation
   * @param {Object} token2 - a point in 3d space {x:x,y:y,z:z} where z is the elevation
   * @param {String} type - "sight" or "collision" (defaults to "sight")
   * @returns {Boolean} returns true if a collision is detected, flase if it's not
   **/

  checkCollision(token1, token2, type = "sight") {
    const token1LosH = this.getTokenLOSheight(token1);
    const token2LosH = this.getTokenLOSheight(token2);
    const p0 = {
      x: token1.center.x,
      y: token1.center.y,
      z: token1LosH,
    };
    const p1 = {
      x: token2.center.x,
      y: token2.center.y,
      z: token2LosH,
    };
    return this.testCollision(p0, p1, type);
  }
}
