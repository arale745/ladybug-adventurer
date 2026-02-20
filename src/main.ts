import './style.css'
import Phaser from 'phaser'

type ResourceType = 'wood' | 'stone' | 'fiber'
type CraftKey = 'raftKit' | 'bugLantern'

type ResourceNode = {
  type: ResourceType
  sprite: Phaser.Physics.Arcade.Sprite
  harvested: boolean
}

type Island = {
  name: string
  palette: {
    grass: number
    grassDark: number
    beach: number
    beachDark: number
    water: number
    waterFoam: number
  }
  resources: Array<{ type: ResourceType; tx: number; ty: number }>
}

type Recipe = {
  key: CraftKey
  label: string
  cost: Partial<Record<ResourceType, number>>
}

type TouchActionKey = 'interact' | 'craft' | 'travel'

const TILE = 32
const HALF_TILE = TILE / 2
const MAP_W = 20
const MAP_H = 12
const GAME_WIDTH = TILE * MAP_W
const GAME_HEIGHT = TILE * MAP_H

class AdventureScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private interactKey!: Phaser.Input.Keyboard.Key
  private travelKey!: Phaser.Input.Keyboard.Key
  private craftKey!: Phaser.Input.Keyboard.Key
  private nextRecipeKey!: Phaser.Input.Keyboard.Key
  private prevRecipeKey!: Phaser.Input.Keyboard.Key

  private islandIndex = 0
  private nodes: ResourceNode[] = []
  private mapLayer = new Phaser.Structs.List<Phaser.GameObjects.Image>(this)

  private readonly inventory: Record<ResourceType, number> = { wood: 0, stone: 0, fiber: 0 }
  private readonly crafted: Record<CraftKey, number> = { raftKit: 0, bugLantern: 0 }

  private dock!: Phaser.GameObjects.Rectangle
  private craftBench!: Phaser.GameObjects.Rectangle

  private hudPanel!: Phaser.GameObjects.Rectangle
  private islandLabel!: Phaser.GameObjects.Text
  private materialText!: Phaser.GameObjects.Text
  private craftedText!: Phaser.GameObjects.Text
  private recipeText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private keyboardHintText!: Phaser.GameObjects.Text
  private hudToggleButton!: Phaser.GameObjects.Rectangle
  private hudToggleText!: Phaser.GameObjects.Text
  private hudExpanded = true

  private touchMove = new Phaser.Math.Vector2(0, 0)
  private queuedTouchActions: Record<TouchActionKey, boolean> = { interact: false, craft: false, travel: false }
  private joystickBasePos = new Phaser.Math.Vector2(74, GAME_HEIGHT - 96)
  private joystickPointerId: number | null = null
  private joystickRadius = 38
  private joystickBaseCircle?: Phaser.GameObjects.Arc
  private joystickThumbCircle?: Phaser.GameObjects.Arc
  private touchButtons: Array<{
    key: TouchActionKey
    circle: Phaser.GameObjects.Arc
    text: Phaser.GameObjects.Text
  }> = []
  private mobileControlsEnabled = false

  private selectedRecipe = 0
  private readonly recipes: Recipe[] = [
    { key: 'raftKit', label: 'Raft Kit', cost: { wood: 2, fiber: 2 } },
    { key: 'bugLantern', label: 'Bug Lantern', cost: { wood: 1, stone: 2 } },
  ]

  private readonly islands: Island[] = [
    {
      name: 'Mossy Nest',
      palette: {
        grass: 0x6fbf66,
        grassDark: 0x518f49,
        beach: 0xe2cc8d,
        beachDark: 0xcdb579,
        water: 0x3572a8,
        waterFoam: 0x5f99c9,
      },
      resources: [
        { type: 'wood', tx: 5, ty: 4 },
        { type: 'wood', tx: 10, ty: 3 },
        { type: 'fiber', tx: 12, ty: 7 },
        { type: 'stone', tx: 8, ty: 8 },
      ],
    },
    {
      name: 'Pebble Ring',
      palette: {
        grass: 0x87c8b2,
        grassDark: 0x66a28f,
        beach: 0xe7d7a9,
        beachDark: 0xd1bf90,
        water: 0x2a679e,
        waterFoam: 0x5f94c2,
      },
      resources: [
        { type: 'stone', tx: 6, ty: 4 },
        { type: 'stone', tx: 12, ty: 7 },
        { type: 'wood', tx: 9, ty: 8 },
        { type: 'fiber', tx: 14, ty: 5 },
      ],
    },
    {
      name: 'Sunset Atoll',
      palette: {
        grass: 0x9fbd68,
        grassDark: 0x78934a,
        beach: 0xefd9a1,
        beachDark: 0xd8be83,
        water: 0x2f5d93,
        waterFoam: 0x5f8abc,
      },
      resources: [
        { type: 'fiber', tx: 6, ty: 6 },
        { type: 'fiber', tx: 13, ty: 6 },
        { type: 'wood', tx: 10, ty: 4 },
        { type: 'stone', tx: 10, ty: 8 },
      ],
    },
  ]

  constructor() {
    super('adventure')
  }

  create() {
    this.createTextures()
    this.createPlayer()
    this.createHotspots()
    this.setupInput()
    this.createHud()
    this.createMobileControls()
    if (this.mobileControlsEnabled && this.scale.parentSize.height > this.scale.parentSize.width) {
      this.hudExpanded = false
    }
    this.layoutHud()
    this.layoutMobileControls()

    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layoutHud()
      this.layoutMobileControls()
    })

    this.loadIsland(0)
    this.setStatus('Explore, gather (E), craft (C), sail (SPACE).')
  }

  update() {
    this.movePlayer()

    if (Phaser.Input.Keyboard.JustDown(this.interactKey) || this.consumeTouchAction('interact')) this.harvestNearbyNode()

    if ((Phaser.Input.Keyboard.JustDown(this.travelKey) || this.consumeTouchAction('travel')) && this.isNear(this.dock, 34)) {
      const next = (this.islandIndex + 1) % this.islands.length
      this.loadIsland(next)
      this.setStatus(`Sailed to ${this.islands[next].name}.`)
    }

    if (Phaser.Input.Keyboard.JustDown(this.nextRecipeKey)) {
      this.selectedRecipe = (this.selectedRecipe + 1) % this.recipes.length
      this.updateHud()
    }
    if (Phaser.Input.Keyboard.JustDown(this.prevRecipeKey)) {
      this.selectedRecipe = (this.selectedRecipe - 1 + this.recipes.length) % this.recipes.length
      this.updateHud()
    }

    if (Phaser.Input.Keyboard.JustDown(this.craftKey) || this.consumeTouchAction('craft')) this.tryCraftSelectedRecipe()
  }

  private createTextures() {
    const g = this.make.graphics({ x: 0, y: 0 })

    const makeTile = (key: string, base: number, dot: number) => {
      const speck = Math.max(2, Math.floor(TILE / 8))
      g.clear()
      g.fillStyle(base)
      g.fillRect(0, 0, TILE, TILE)
      g.fillStyle(dot)
      g.fillRect(2, 2, speck, speck)
      g.fillRect(TILE - 7, Math.floor(TILE * 0.3), speck, speck)
      g.fillRect(Math.floor(TILE * 0.45), TILE - 6, speck, speck)
      g.generateTexture(key, TILE, TILE)
    }

    makeTile('waterTile', 0x2f6798, 0x5f99c9)
    makeTile('beachTile', 0xe2cc8d, 0xcdb579)
    makeTile('grassTile', 0x6fbf66, 0x518f49)

    g.clear()
    g.fillStyle(0x8b6235)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('wood', 10, 10)

    g.clear()
    g.fillStyle(0x929eaa)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('stone', 10, 10)

    g.clear()
    g.fillStyle(0x79b34d)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('fiber', 10, 10)

    const drawLadybug = (key: string, lines: string[]) => {
      const colors: Record<string, number> = {
        b: 0x111111,
        r: 0xd63b3b,
        d: 0xa32525,
        h: 0xff7575,
        w: 0xf3f3f3,
      }

      g.clear()
      lines.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          const c = line[x]
          const color = colors[c]
          if (color !== undefined) {
            g.fillStyle(color)
            g.fillRect(x, y, 1, 1)
          }
        }
      })
      g.generateTexture(key, 16, 16)
    }

    drawLadybug('ladybug-0', [
      '................',
      '......bb........',
      '.....bwwb.......',
      '....bbbbbb......',
      '...bbrrrrbb.....',
      '...brrbbrrb.....',
      '..brrrbbrrrb....',
      '..brhrbbrhrb....',
      '..brrrbbrrrb....',
      '..brrrbbrrrb....',
      '...brbbbbrb.....',
      '....bbbbbb......',
      '.....b..b.......',
      '....b....b......',
      '................',
      '................',
    ])

    drawLadybug('ladybug-1', [
      '................',
      '......bb........',
      '.....bwwb.......',
      '....bbbbbb......',
      '..bbrrrrrrbb....',
      '..brrrbbrrrb....',
      '.brrhrbbrhrrb...',
      '.brrrrbbrrrrb...',
      '.brrrrbbrrrrb...',
      '.brrrrbbrrrrb...',
      '..brrbbbbrrb....',
      '...bbbbbbbb.....',
      '....b....b......',
      '...b......b.....',
      '................',
      '................',
    ])

    g.destroy()
  }

  private createPlayer() {
    this.player = this.physics.add.sprite(10 * TILE + HALF_TILE, 6 * TILE + HALF_TILE, 'ladybug-0')
    this.player.setScale(2)
    this.player.setCollideWorldBounds(true)
    this.player.setSize(8, 8)

    if (!this.anims.exists('ladybug-wiggle')) {
      this.anims.create({
        key: 'ladybug-wiggle',
        frames: [{ key: 'ladybug-0' }, { key: 'ladybug-1' }],
        frameRate: 6,
        repeat: -1,
      })
    }
  }

  private createHotspots() {
    this.dock = this.add.rectangle(18 * TILE + HALF_TILE, 6 * TILE + HALF_TILE, 28, 48, 0x8d6839).setDepth(20)
    this.craftBench = this.add.rectangle(2 * TILE + HALF_TILE, 6 * TILE + HALF_TILE, 28, 28, 0x5f4529).setDepth(20)

    this.add.text(1 * TILE + 6, 7 * TILE + 12, 'CRAFT', { fontFamily: 'monospace', fontSize: '12px', color: '#fff5d6' }).setDepth(21)
    this.add.text(17 * TILE + 10, 7 * TILE + 12, 'DOCK', { fontFamily: 'monospace', fontSize: '12px', color: '#fff5d6' }).setDepth(21)

    this.physics.add.existing(this.dock, true)
    this.physics.add.existing(this.craftBench, true)
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.travelKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.craftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C)
    this.nextRecipeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.prevRecipeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
  }

  private createMobileControls() {
    const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (!this.sys.game.device.input.touch && !coarsePointer) return

    this.mobileControlsEnabled = true

    this.joystickBaseCircle = this.add.circle(this.joystickBasePos.x, this.joystickBasePos.y, this.joystickRadius, 0x20395a, 0.45).setDepth(140)
    this.joystickThumbCircle = this.add.circle(this.joystickBasePos.x, this.joystickBasePos.y, 16, 0x77a8d8, 0.72).setDepth(141)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.joystickBasePos.x, this.joystickBasePos.y)
      if (dist <= this.joystickRadius * 1.5 && this.joystickPointerId === null) {
        this.joystickPointerId = pointer.id
        this.updateTouchMove(pointer.x, pointer.y)
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.joystickPointerId === pointer.id) this.updateTouchMove(pointer.x, pointer.y)
    })

    const releaseStick = (pointer: Phaser.Input.Pointer) => {
      if (this.joystickPointerId === pointer.id) this.resetTouchMove()
    }
    this.input.on('pointerup', releaseStick)
    this.input.on('pointerupoutside', releaseStick)

    const makeActionButton = (label: string, color: number, key: TouchActionKey) => {
      const circle = this.add.circle(0, 0, 24, color, 0.7).setDepth(140)
      circle.setStrokeStyle(2, 0xe7f1ff, 0.75)
      circle.setInteractive(new Phaser.Geom.Circle(0, 0, 24), Phaser.Geom.Circle.Contains)
      circle.on('pointerdown', () => {
        this.queuedTouchActions[key] = true
      })

      const text = this.add.text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      }).setOrigin(0.5).setDepth(141)

      this.touchButtons.push({ key, circle, text })
    }

    makeActionButton('SAIL', 0x397aab, 'travel')
    makeActionButton('E', 0x3d8e4c, 'interact')
    makeActionButton('C', 0x916340, 'craft')
  }

  private updateTouchMove(pointerX: number, pointerY: number) {
    const dx = pointerX - this.joystickBasePos.x
    const dy = pointerY - this.joystickBasePos.y
    const vector = new Phaser.Math.Vector2(dx, dy)

    if (vector.length() > this.joystickRadius) {
      vector.normalize().scale(this.joystickRadius)
    }

    this.touchMove.set(vector.x / this.joystickRadius, vector.y / this.joystickRadius)
    this.joystickThumbCircle?.setPosition(this.joystickBasePos.x + vector.x, this.joystickBasePos.y + vector.y)
  }

  private resetTouchMove() {
    this.joystickPointerId = null
    this.touchMove.set(0, 0)
    this.joystickThumbCircle?.setPosition(this.joystickBasePos.x, this.joystickBasePos.y)
  }

  private consumeTouchAction(action: TouchActionKey) {
    const active = this.queuedTouchActions[action]
    this.queuedTouchActions[action] = false
    return active
  }

  private createHud() {
    this.hudPanel = this.add.rectangle(GAME_WIDTH - 120, 92, 230, 170, 0x101d2f, 0.85)
    this.hudPanel.setStrokeStyle(1, 0x8eb7da)
    this.hudPanel.setDepth(100)

    this.islandLabel = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: '16px', color: '#f9f2d7' }).setDepth(101)
    this.materialText = this.add.text(GAME_WIDTH - 224, 22, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d8ecff' }).setDepth(101)
    this.craftedText = this.add.text(GAME_WIDTH - 224, 76, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d8ecff' }).setDepth(101)
    this.recipeText = this.add.text(GAME_WIDTH - 224, 126, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffe39d' }).setDepth(101)

    this.statusText = this.add.text(10, GAME_HEIGHT - 40, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffe39d',
      backgroundColor: '#121f31',
      padding: { left: 4, right: 4, top: 2, bottom: 2 },
      wordWrap: { width: GAME_WIDTH - 20 },
    }).setDepth(102)

    this.keyboardHintText = this.add.text(10, GAME_HEIGHT - 18, 'Keys: Z/X recipe, C craft, E gather, SPACE sail', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c9dfff',
      backgroundColor: '#0f1a2b',
      padding: { left: 3, right: 3, top: 1, bottom: 1 },
    }).setDepth(102)

    this.hudToggleButton = this.add.rectangle(GAME_WIDTH - 28, 16, 44, 20, 0x15314e, 0.9).setDepth(103)
    this.hudToggleButton.setStrokeStyle(1, 0x8eb7da)
    this.hudToggleButton.setInteractive()
    this.hudToggleButton.on('pointerdown', () => {
      this.hudExpanded = !this.hudExpanded
      this.layoutHud()
    })

    this.hudToggleText = this.add.text(GAME_WIDTH - 28, 16, 'INV', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#d8ecff',
    }).setOrigin(0.5).setDepth(104)
  }

  private layoutHud() {
    const compact = this.mobileControlsEnabled || this.scale.parentSize.width < 900
    const portrait = this.scale.parentSize.height > this.scale.parentSize.width

    if (portrait && this.mobileControlsEnabled) {
      this.hudToggleButton.setVisible(true).setPosition(GAME_WIDTH - 28, 16)
      this.hudToggleText.setVisible(true).setPosition(GAME_WIDTH - 28, 16).setText(this.hudExpanded ? 'X' : 'INV')

      this.islandLabel.setFontSize(13).setPosition(8, 8)
      this.statusText.setPosition(8, 26).setFontSize(10).setWordWrapWidth(GAME_WIDTH - (this.hudExpanded ? 206 : 16))
      this.keyboardHintText.setVisible(false)

      if (this.hudExpanded) {
        this.hudPanel.setVisible(true).setPosition(GAME_WIDTH - 94, 90).setSize(182, 160)
        this.materialText.setVisible(true).setPosition(GAME_WIDTH - 176, 26).setFontSize(11)
        this.craftedText.setVisible(true).setPosition(GAME_WIDTH - 176, 72).setFontSize(11)
        this.recipeText.setVisible(true).setPosition(GAME_WIDTH - 176, 116).setFontSize(11)
      } else {
        this.hudPanel.setVisible(false)
        this.materialText.setVisible(false)
        this.craftedText.setVisible(false)
        this.recipeText.setVisible(false)
      }
      return
    }

    this.hudExpanded = true
    this.hudToggleButton.setVisible(false)
    this.hudToggleText.setVisible(false)
    this.hudPanel.setVisible(true)
    this.materialText.setVisible(true)
    this.craftedText.setVisible(true)
    this.recipeText.setVisible(true)

    if (compact) {
      this.hudPanel.setPosition(GAME_WIDTH - 96, 82).setSize(186, 146)
      this.islandLabel.setFontSize(14).setPosition(12, 10)
      this.materialText.setPosition(GAME_WIDTH - 182, 18).setFontSize(11)
      this.craftedText.setPosition(GAME_WIDTH - 182, 63).setFontSize(11)
      this.recipeText.setPosition(GAME_WIDTH - 182, 104).setFontSize(11)
      this.statusText.setPosition(8, GAME_HEIGHT - 56).setFontSize(10).setWordWrapWidth(GAME_WIDTH - 16)
      this.keyboardHintText.setVisible(!this.mobileControlsEnabled)
      this.keyboardHintText.setPosition(8, GAME_HEIGHT - 18).setFontSize(9)
    } else {
      this.hudPanel.setPosition(GAME_WIDTH - 120, 92).setSize(230, 170)
      this.islandLabel.setFontSize(16).setPosition(12, 10)
      this.materialText.setPosition(GAME_WIDTH - 224, 22).setFontSize(12)
      this.craftedText.setPosition(GAME_WIDTH - 224, 76).setFontSize(12)
      this.recipeText.setPosition(GAME_WIDTH - 224, 126).setFontSize(12)
      this.statusText.setPosition(10, GAME_HEIGHT - 40).setFontSize(11).setWordWrapWidth(GAME_WIDTH - 20)
      this.keyboardHintText.setVisible(true)
      this.keyboardHintText.setPosition(10, GAME_HEIGHT - 18).setFontSize(10)
    }
  }

  private layoutMobileControls() {
    if (!this.mobileControlsEnabled || !this.joystickBaseCircle || !this.joystickThumbCircle) return

    const compact = this.scale.parentSize.width < 760
    const portrait = this.scale.parentSize.height > this.scale.parentSize.width

    const buttonRadius = compact ? 22 : 24
    this.joystickRadius = compact ? 34 : 38
    this.joystickBasePos.set(compact ? 68 : 78, GAME_HEIGHT - (compact ? 86 : 98))

    this.joystickBaseCircle.setPosition(this.joystickBasePos.x, this.joystickBasePos.y)
    this.joystickBaseCircle.setRadius(this.joystickRadius)
    this.joystickThumbCircle.setPosition(this.joystickBasePos.x, this.joystickBasePos.y)

    const rightX = GAME_WIDTH - (compact ? 42 : 48)
    const startY = portrait ? (compact ? GAME_HEIGHT - 190 : GAME_HEIGHT - 202) : GAME_HEIGHT - (compact ? 124 : 132)
    const gap = compact ? 36 : 40

    this.touchButtons.forEach((btn, i) => {
      const y = startY + i * gap
      btn.circle.setRadius(buttonRadius)
      btn.circle.setPosition(rightX, y)
      btn.circle.setInteractive(new Phaser.Geom.Circle(0, 0, buttonRadius), Phaser.Geom.Circle.Contains)
      btn.text.setPosition(rightX, y)
      btn.text.setFontSize(compact ? '10px' : '12px')
    })

    this.resetTouchMove()
  }

  private loadIsland(index: number) {
    this.islandIndex = index
    this.clearMapTiles()

    const island = this.islands[index]
    this.buildIslandTiles(island)

    for (const node of this.nodes) node.sprite.destroy()
    this.nodes = []

    for (const res of island.resources) {
      const x = res.tx * TILE + HALF_TILE
      const y = res.ty * TILE + HALF_TILE
      const sprite = this.physics.add.sprite(x, y, res.type).setDepth(30)
      sprite.setScale(2)
      sprite.setImmovable(true)
      sprite.body?.setAllowGravity(false)
      this.nodes.push({ type: res.type, sprite, harvested: false })
    }

    this.player.setPosition(10 * TILE + HALF_TILE, 6 * TILE + HALF_TILE)
    this.updateHud()
  }

  private buildIslandTiles(island: Island) {
    this.textures.remove('waterTile')
    this.textures.remove('beachTile')
    this.textures.remove('grassTile')

    const g = this.make.graphics({ x: 0, y: 0 })
    const drawTile = (key: string, base: number, dot: number) => {
      const speck = Math.max(2, Math.floor(TILE / 8))
      g.clear()
      g.fillStyle(base)
      g.fillRect(0, 0, TILE, TILE)
      g.fillStyle(dot)
      g.fillRect(2, 2, speck, speck)
      g.fillRect(TILE - 7, Math.floor(TILE * 0.3), speck, speck)
      g.fillRect(Math.floor(TILE * 0.45), TILE - 6, speck, speck)
      g.generateTexture(key, TILE, TILE)
    }

    drawTile('waterTile', island.palette.water, island.palette.waterFoam)
    drawTile('beachTile', island.palette.beach, island.palette.beachDark)
    drawTile('grassTile', island.palette.grass, island.palette.grassDark)
    g.destroy()

    const cx = MAP_W / 2
    const cy = MAP_H / 2

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const dx = (tx + 0.5 - cx) / 8
        const dy = (ty + 0.5 - cy) / 4.8
        const d = Math.sqrt(dx * dx + dy * dy)

        let key = 'waterTile'
        if (d < 1.0) key = 'grassTile'
        else if (d < 1.25) key = 'beachTile'

        const tile = this.add.image(tx * TILE + HALF_TILE, ty * TILE + HALF_TILE, key)
        tile.setDepth(-20)
        this.mapLayer.add(tile)
      }
    }
  }

  private clearMapTiles() {
    this.mapLayer.list.forEach((tile) => tile.destroy())
    this.mapLayer.removeAll()
  }

  private movePlayer() {
    const speed = 132
    let vx = 0
    let vy = 0

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed

    if (vx === 0 && vy === 0 && this.mobileControlsEnabled) {
      vx = this.touchMove.x * speed
      vy = this.touchMove.y * speed
    }

    this.player.setVelocity(vx, vy)

    if (vx !== 0) this.player.setFlipX(vx < 0)

    const moving = vx !== 0 || vy !== 0
    if (moving) {
      if (!this.player.anims.isPlaying) this.player.play('ladybug-wiggle')
    } else {
      this.player.anims.stop()
      this.player.setTexture('ladybug-0')
    }
  }

  private harvestNearbyNode() {
    const node = this.nodes.find((n) => !n.harvested && Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y) < 26)
    if (!node) {
      this.setStatus('No resource nearby. Move close and press E.')
      return
    }

    node.harvested = true
    node.sprite.disableBody(true, true)
    this.inventory[node.type] += 1
    this.setStatus(`Collected ${node.type}.`)
    this.updateHud()
  }

  private tryCraftSelectedRecipe() {
    if (!this.isNear(this.craftBench, 34)) {
      this.setStatus('Stand near the craft bench to craft.')
      return
    }

    const recipe = this.recipes[this.selectedRecipe]
    const canCraft = Object.entries(recipe.cost).every(([k, amount]) => this.inventory[k as ResourceType] >= (amount ?? 0))
    if (!canCraft) {
      this.setStatus(`Missing materials for ${recipe.label}.`)
      return
    }

    Object.entries(recipe.cost).forEach(([k, amount]) => {
      this.inventory[k as ResourceType] -= amount ?? 0
    })
    this.crafted[recipe.key] += 1

    this.setStatus(`Crafted ${recipe.label}!`)
    this.updateHud()
  }

  private updateHud() {
    const island = this.islands[this.islandIndex]
    this.islandLabel.setText(`Island: ${island.name}`)

    this.materialText.setText([
      `MATERIALS`,
      `wood:  ${this.inventory.wood}`,
      `stone: ${this.inventory.stone}`,
      `fiber: ${this.inventory.fiber}`,
    ])

    this.craftedText.setText([
      `CRAFTED`,
      `raft kit:    ${this.crafted.raftKit}`,
      `bug lantern: ${this.crafted.bugLantern}`,
    ])

    this.recipeText.setText(this.recipes.map((r, i) => {
      const marker = i === this.selectedRecipe ? '>' : ' '
      const cost = Object.entries(r.cost)
        .map(([k, v]) => `${v}${k[0]}`)
        .join(' + ')
      return `${marker} ${r.label} (${cost})`
    }))
  }

  private isNear(target: Phaser.GameObjects.Rectangle, range: number) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y) <= range
  }

  private setStatus(message: string) {
    this.statusText.setText(message)
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'app',
  backgroundColor: '#1f3f67',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [AdventureScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

new Phaser.Game(config)
