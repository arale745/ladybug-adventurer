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

type NpcDefinition = {
  name: string
  tx: number
  ty: number
}

type SaveData = {
  islandIndex: number
  inventory: Record<ResourceType, number>
  crafted: Record<CraftKey, number>
  selectedRecipe: number
  quest: { lanternRequested: boolean; lanternDelivered: boolean }
  cameraZoom?: number
}

type TouchActionKey = 'interact' | 'craft' | 'travel'
type Biome = 'water' | 'beach' | 'grass'

const TILE = 32
const HALF_TILE = TILE / 2
const MAP_W = 20
const MAP_H = 12
const MAP_PIXEL_WIDTH = TILE * MAP_W
const MAP_PIXEL_HEIGHT = TILE * MAP_H

const VIEW_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 1280
const VIEW_HEIGHT = typeof window !== 'undefined' ? window.innerHeight : 720
const GAME_WIDTH = MAP_PIXEL_WIDTH
const GAME_HEIGHT = Math.max(MAP_PIXEL_HEIGHT, Math.min(1800, Math.round((GAME_WIDTH * VIEW_HEIGHT) / Math.max(1, VIEW_WIDTH))))
const WORLD_OFFSET_Y = Math.floor((GAME_HEIGHT - MAP_PIXEL_HEIGHT) / 2)

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
  private solidColliders: Phaser.Physics.Arcade.Collider[] = []
  private mapLayer = new Phaser.Structs.List<Phaser.GameObjects.GameObject>(this)

  private readonly inventory: Record<ResourceType, number> = { wood: 0, stone: 0, fiber: 0 }
  private readonly crafted: Record<CraftKey, number> = { raftKit: 0, bugLantern: 0 }
  private quest = { lanternRequested: false, lanternDelivered: false }
  private readonly saveKey = 'ladybug-adventurer-save-v1'

  private dock!: Phaser.GameObjects.Rectangle
  private craftBench!: Phaser.GameObjects.Rectangle
  private npcSprite?: Phaser.Physics.Arcade.Sprite
  private npcLabel?: Phaser.GameObjects.Text

  private hudPanel!: Phaser.GameObjects.Rectangle
  private islandLabel!: Phaser.GameObjects.Text
  private materialText!: Phaser.GameObjects.Text
  private craftedText!: Phaser.GameObjects.Text
  private recipeText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private keyboardHintText!: Phaser.GameObjects.Text
  private hudToggleButton!: Phaser.GameObjects.Rectangle
  private hudToggleText!: Phaser.GameObjects.Text
  private fpsText!: Phaser.GameObjects.Text
  private hudExpanded = true
  private fpsTick = 0

  private uiCamera?: Phaser.Cameras.Scene2D.Camera
  private uiElements: Phaser.GameObjects.GameObject[] = []
  private worldElements: Phaser.GameObjects.GameObject[] = []

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
    hitZone: Phaser.GameObjects.Zone
  }> = []
  private mobileControlsEnabled = false

  private playerShadow?: Phaser.GameObjects.Ellipse
  private npcShadow?: Phaser.GameObjects.Ellipse
  private waterTiles: Array<{ tile: Phaser.GameObjects.Image; variant: number }> = []

  private activeTouches = new Map<number, Phaser.Math.Vector2>()
  private pinchActive = false
  private pinchStartDistance = 0
  private pinchStartZoom = 1

  private selectedRecipe = 0
  private readonly recipes: Recipe[] = [
    { key: 'raftKit', label: 'Raft Kit', cost: { wood: 2, fiber: 2 } },
    { key: 'bugLantern', label: 'Bug Lantern', cost: { wood: 1, stone: 2 } },
  ]

  private readonly npcByIsland: NpcDefinition[] = [
    { name: 'Mira', tx: 4, ty: 5 },
    { name: 'Tomo', tx: 15, ty: 5 },
    { name: 'Nori', tx: 10, ty: 9 },
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

  preload() {}

  create() {
    this.createTextures()
    this.createPlayer()
    this.createHotspots()
    this.physics.world.setBounds(0, WORLD_OFFSET_Y, MAP_PIXEL_WIDTH, MAP_PIXEL_HEIGHT)
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

    this.loadSave()
    this.loadIsland(this.islandIndex)
    this.setupCameras()
    this.startWaterAnimation()
    this.exposeDebugHooks()

    this.time.addEvent({
      delay: 15000,
      loop: true,
      callback: () => this.saveNow(),
    })
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.saveNow())

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.saveNow())
    }

    this.setStatus('Explore, gather (E), craft (C), sail (SPACE). Auto-save enabled.')
  }

  update() {
    this.movePlayer()

    this.fpsTick++
    if (this.fpsTick % 12 === 0) {
      const fps = this.game.loop.actualFps
      this.fpsText.setText(`FPS: ${Math.round(fps)}`)
      this.fpsText.setColor(fps >= 58 ? '#c6f7c6' : fps >= 45 ? '#ffe39d' : '#ff8f8f')
    }

    if (Phaser.Input.Keyboard.JustDown(this.interactKey) || this.consumeTouchAction('interact')) this.handleInteract()

    if ((Phaser.Input.Keyboard.JustDown(this.travelKey) || this.consumeTouchAction('travel')) && this.isNear(this.dock, 34)) {
      const next = (this.islandIndex + 1) % this.islands.length
      this.loadIsland(next)
      this.setStatus(`Sailed to ${this.islands[next].name}.`)
      this.saveNow()
    }

    if (Phaser.Input.Keyboard.JustDown(this.nextRecipeKey)) {
      this.selectedRecipe = (this.selectedRecipe + 1) % this.recipes.length
      this.updateHud()
      this.saveNow()
    }
    if (Phaser.Input.Keyboard.JustDown(this.prevRecipeKey)) {
      this.selectedRecipe = (this.selectedRecipe - 1 + this.recipes.length) % this.recipes.length
      this.updateHud()
      this.saveNow()
    }

    if (Phaser.Input.Keyboard.JustDown(this.craftKey) || this.consumeTouchAction('craft')) this.tryCraftSelectedRecipe()
  }

  private createTextures() {
    const g = this.make.graphics({ x: 0, y: 0 })

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

    g.clear()
    g.fillStyle(0x4a2f1f)
    g.fillRect(3, 0, 6, 4)
    g.fillStyle(0xd9a47b)
    g.fillRect(2, 3, 8, 6)
    g.fillStyle(0x6a4bb8)
    g.fillRect(1, 8, 10, 8)
    g.fillStyle(0x111111)
    g.fillRect(4, 5, 1, 1)
    g.fillRect(7, 5, 1, 1)
    g.generateTexture('npc', 12, 16)

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

  private createTerrainTextures(palette: Island['palette']) {
    const textureKeys = [
      'grassTile-0',
      'grassTile-1',
      'grassTile-2',
      'grassTile-3',
      'beachTile-0',
      'beachTile-1',
      'beachTile-2',
      'waterTile-0-0',
      'waterTile-0-1',
      'waterTile-0-2',
      'waterTile-1-0',
      'waterTile-1-1',
      'waterTile-1-2',
    ]

    textureKeys.forEach((key) => {
      if (this.textures.exists(key)) this.textures.remove(key)
    })

    const g = this.make.graphics({ x: 0, y: 0 })

    const makeTile = (key: string, base: number, accent: number, variantSeed: number, grain = 18) => {
      g.clear()
      g.fillStyle(base, 1)
      g.fillRect(0, 0, TILE, TILE)

      g.fillStyle(accent, 0.18)
      for (let y = 0; y < TILE; y += 4) {
        const wobble = ((variantSeed * 7 + y * 3) % 5) - 2
        g.fillRect(0, y + wobble, TILE, 1)
      }

      g.fillStyle(accent, 0.32)
      for (let i = 0; i < grain; i++) {
        const x = (variantSeed * 17 + i * 13) % TILE
        const y = (variantSeed * 11 + i * 7) % TILE
        const w = 1 + ((variantSeed + i) % 2)
        const h = 1 + ((variantSeed + i * 2) % 2)
        g.fillRect(x, y, w, h)
      }
      g.generateTexture(key, TILE, TILE)
    }

    makeTile('grassTile-0', palette.grass, palette.grassDark, 1, 24)
    makeTile('grassTile-1', palette.grass, palette.grassDark, 2, 22)
    makeTile('grassTile-2', palette.grass, palette.grassDark, 3, 20)
    makeTile('grassTile-3', palette.grass, palette.grassDark, 4, 26)

    makeTile('beachTile-0', palette.beach, palette.beachDark, 5, 14)
    makeTile('beachTile-1', palette.beach, palette.beachDark, 6, 16)
    makeTile('beachTile-2', palette.beach, palette.beachDark, 7, 12)

    makeTile('waterTile-0-0', palette.water, palette.waterFoam, 8, 16)
    makeTile('waterTile-0-1', palette.water, palette.waterFoam, 9, 14)
    makeTile('waterTile-0-2', palette.water, palette.waterFoam, 10, 18)

    const brighten = (hex: number, amount: number) => {
      const r = Phaser.Math.Clamp(((hex >> 16) & 0xff) + amount, 0, 255)
      const gg = Phaser.Math.Clamp(((hex >> 8) & 0xff) + amount, 0, 255)
      const b = Phaser.Math.Clamp((hex & 0xff) + amount, 0, 255)
      return (r << 16) | (gg << 8) | b
    }

    makeTile('waterTile-1-0', brighten(palette.water, 8), brighten(palette.waterFoam, 12), 11, 16)
    makeTile('waterTile-1-1', brighten(palette.water, 8), brighten(palette.waterFoam, 12), 12, 14)
    makeTile('waterTile-1-2', brighten(palette.water, 8), brighten(palette.waterFoam, 12), 13, 18)

    g.destroy()
  }

  private tileNoise(tx: number, ty: number, seed: number) {
    const n = Math.sin((tx + 1) * 127.1 + (ty + 1) * 311.7 + seed * 79.3) * 43758.5453
    return n - Math.floor(n)
  }

  private pickVariant(tx: number, ty: number, count: number, seed: number) {
    return Math.floor(this.tileNoise(tx, ty, seed) * count) % count
  }

  private createPlayer() {
    this.playerShadow = this.trackWorld(this.add.ellipse(10 * TILE + HALF_TILE, WORLD_OFFSET_Y + 6 * TILE + HALF_TILE + 10, 20, 8, 0x000000, 0.25).setDepth(19))

    this.player = this.trackWorld(this.physics.add.sprite(10 * TILE + HALF_TILE, WORLD_OFFSET_Y + 6 * TILE + HALF_TILE, 'ladybug-0'))
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
    this.dock = this.trackWorld(this.add.rectangle(18 * TILE + HALF_TILE, WORLD_OFFSET_Y + 6 * TILE + HALF_TILE, 28, 48, 0x8d6839).setDepth(20))
    this.craftBench = this.trackWorld(this.add.rectangle(2 * TILE + HALF_TILE, WORLD_OFFSET_Y + 6 * TILE + HALF_TILE, 28, 28, 0x5f4529).setDepth(20))

    this.trackWorld(this.add.text(1 * TILE + 6, WORLD_OFFSET_Y + 7 * TILE + 12, 'CRAFT', { fontFamily: 'monospace', fontSize: '12px', color: '#fff5d6' }).setDepth(21))
    this.trackWorld(this.add.text(17 * TILE + 10, WORLD_OFFSET_Y + 7 * TILE + 12, 'DOCK', { fontFamily: 'monospace', fontSize: '12px', color: '#fff5d6' }).setDepth(21))

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

    this.input.addPointer(2)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        this.activeTouches.set(pointer.id, new Phaser.Math.Vector2(pointer.x, pointer.y))
        this.maybeStartPinch()
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.activeTouches.has(pointer.id)) return
      this.activeTouches.set(pointer.id, new Phaser.Math.Vector2(pointer.x, pointer.y))
      this.updatePinchZoom()
    })

    const releaseTouch = (pointer: Phaser.Input.Pointer) => {
      if (this.activeTouches.delete(pointer.id)) this.updatePinchZoom()
    }
    this.input.on('pointerup', releaseTouch)
    this.input.on('pointerupoutside', releaseTouch)
  }

  private createMobileControls() {
    const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (!this.sys.game.device.input.touch && !coarsePointer) return

    this.mobileControlsEnabled = true

    this.joystickBaseCircle = this.trackUi(this.add.circle(this.joystickBasePos.x, this.joystickBasePos.y, this.joystickRadius, 0x20395a, 0.45).setDepth(140))
    this.joystickThumbCircle = this.trackUi(this.add.circle(this.joystickBasePos.x, this.joystickBasePos.y, 16, 0x77a8d8, 0.72).setDepth(141))

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
      const circle = this.trackUi(this.add.circle(0, 0, 24, color, 0.7).setDepth(140))
      circle.setStrokeStyle(2, 0xe7f1ff, 0.75)

      const hitZone = this.trackUi(this.add.zone(0, 0, 56, 56).setDepth(142))
      hitZone.setInteractive()
      hitZone.on('pointerdown', () => {
        this.queuedTouchActions[key] = true
      })

      const text = this.trackUi(this.add.text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      }).setOrigin(0.5).setDepth(143))

      this.touchButtons.push({ key, circle, text, hitZone })
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

  private maybeStartPinch() {
    if (this.pinchActive || this.activeTouches.size < 2) return

    const touches = Array.from(this.activeTouches.values())
    this.pinchStartDistance = Phaser.Math.Distance.Between(touches[0].x, touches[0].y, touches[1].x, touches[1].y)
    if (this.pinchStartDistance < 10) return

    this.pinchStartZoom = this.cameras.main.zoom
    this.pinchActive = true
  }

  private updatePinchZoom() {
    if (this.activeTouches.size < 2) {
      if (this.pinchActive) this.saveNow()
      this.pinchActive = false
      return
    }

    if (!this.pinchActive) {
      this.maybeStartPinch()
      return
    }

    const touches = Array.from(this.activeTouches.values())
    const currentDistance = Phaser.Math.Distance.Between(touches[0].x, touches[0].y, touches[1].x, touches[1].y)
    if (currentDistance < 10 || this.pinchStartDistance < 10) return

    const targetZoom = Phaser.Math.Clamp((currentDistance / this.pinchStartDistance) * this.pinchStartZoom, 0.75, 2.25)
    this.cameras.main.setZoom(targetZoom)
  }

  private createHud() {
    this.hudPanel = this.trackUi(this.add.rectangle(GAME_WIDTH - 120, 92, 230, 170, 0x101d2f, 0.85))
    this.hudPanel.setStrokeStyle(1, 0x8eb7da)
    this.hudPanel.setDepth(100)

    this.islandLabel = this.trackUi(this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: '16px', color: '#f9f2d7' }).setDepth(101))
    this.materialText = this.trackUi(this.add.text(GAME_WIDTH - 224, 22, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d8ecff' }).setDepth(101))
    this.craftedText = this.trackUi(this.add.text(GAME_WIDTH - 224, 76, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d8ecff' }).setDepth(101))
    this.recipeText = this.trackUi(this.add.text(GAME_WIDTH - 224, 126, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffe39d' }).setDepth(101))

    this.statusText = this.trackUi(this.add.text(10, GAME_HEIGHT - 40, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffe39d',
      backgroundColor: '#121f31',
      padding: { left: 4, right: 4, top: 2, bottom: 2 },
      wordWrap: { width: GAME_WIDTH - 20 },
    }).setDepth(102))

    this.keyboardHintText = this.trackUi(this.add.text(10, GAME_HEIGHT - 18, 'Keys: Z/X recipe, C craft, E gather, SPACE sail', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c9dfff',
      backgroundColor: '#0f1a2b',
      padding: { left: 3, right: 3, top: 1, bottom: 1 },
    }).setDepth(102))

    this.hudToggleButton = this.trackUi(this.add.rectangle(GAME_WIDTH - 28, 16, 44, 20, 0x15314e, 0.9).setDepth(103))
    this.hudToggleButton.setStrokeStyle(1, 0x8eb7da)
    this.hudToggleButton.setInteractive()
    this.hudToggleButton.on('pointerdown', () => {
      this.hudExpanded = !this.hudExpanded
      this.layoutHud()
    })

    this.hudToggleText = this.trackUi(this.add.text(GAME_WIDTH - 28, 16, 'INV', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#d8ecff',
    }).setOrigin(0.5).setDepth(104))

    this.fpsText = this.trackUi(this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 8, 'FPS: --', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c6f7c6',
      backgroundColor: '#102216',
      padding: { left: 3, right: 3, top: 1, bottom: 1 },
    }).setOrigin(1, 1).setDepth(104))
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
      this.fpsText.setPosition(GAME_WIDTH - 8, GAME_HEIGHT - 8)
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

    this.fpsText.setPosition(GAME_WIDTH - 8, GAME_HEIGHT - 8)
  }

  private layoutMobileControls() {
    if (!this.mobileControlsEnabled || !this.joystickBaseCircle || !this.joystickThumbCircle) return

    const portrait = this.scale.parentSize.height > this.scale.parentSize.width
    const renderScale = Math.max(0.35, Math.min(1, this.scale.parentSize.width / GAME_WIDTH))
    const pxToWorld = (px: number) => Math.round(px / renderScale)

    const buttonRadius = pxToWorld(portrait ? 34 : 28)
    this.joystickRadius = pxToWorld(portrait ? 52 : 44)
    this.joystickBasePos.set(pxToWorld(58), GAME_HEIGHT - pxToWorld(portrait ? 78 : 86))

    this.joystickBaseCircle.setPosition(this.joystickBasePos.x, this.joystickBasePos.y)
    this.joystickBaseCircle.setRadius(this.joystickRadius)
    this.joystickThumbCircle.setRadius(Math.max(pxToWorld(20), Math.round(this.joystickRadius * 0.45)))
    this.joystickThumbCircle.setPosition(this.joystickBasePos.x, this.joystickBasePos.y)

    const rightX = GAME_WIDTH - pxToWorld(46)
    const startY = GAME_HEIGHT - pxToWorld(portrait ? 250 : 170)
    const gap = pxToWorld(portrait ? 88 : 68)

    this.touchButtons.forEach((btn, i) => {
      const y = startY + i * gap
      btn.circle.setRadius(buttonRadius)
      btn.circle.setPosition(rightX, y)
      btn.hitZone.setPosition(rightX, y)
      btn.hitZone.setSize(buttonRadius * 2.4, buttonRadius * 2.4)
      btn.text.setPosition(rightX, y)
      btn.text.setFontSize(`${pxToWorld(portrait ? 16 : 13)}px`)
    })

    this.resetTouchMove()
  }

  private loadIsland(index: number) {
    this.islandIndex = index
    this.clearMapTiles()

    const island = this.islands[index]
    this.createTerrainTextures(island.palette)
    this.buildIslandTiles(island)

    this.solidColliders.forEach((c) => c.destroy())
    this.solidColliders = []

    for (const node of this.nodes) node.sprite.destroy()
    this.nodes = []

    this.npcSprite?.destroy()
    this.npcLabel?.destroy()
    this.npcShadow?.destroy()
    this.npcSprite = undefined
    this.npcLabel = undefined
    this.npcShadow = undefined

    for (const res of island.resources) {
      const x = res.tx * TILE + HALF_TILE
      const y = WORLD_OFFSET_Y + res.ty * TILE + HALF_TILE
      const sprite = this.trackWorld(this.physics.add.sprite(x, y, res.type).setDepth(30))
      sprite.setScale(2)
      sprite.setImmovable(true)
      sprite.body?.setAllowGravity(false)
      this.nodes.push({ type: res.type, sprite, harvested: false })
      this.solidColliders.push(this.physics.add.collider(this.player, sprite))

      this.tweens.add({
        targets: sprite,
        y: y - 3,
        duration: 1100 + Math.floor(Math.random() * 500),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    const npc = this.npcByIsland[index]
    if (npc) {
      const npcX = npc.tx * TILE + HALF_TILE
      const npcY = WORLD_OFFSET_Y + npc.ty * TILE + HALF_TILE
      this.npcShadow = this.trackWorld(this.add.ellipse(npcX, npcY + 12, 20, 8, 0x000000, 0.24).setDepth(27))
      this.npcSprite = this.trackWorld(this.physics.add.sprite(npcX, npcY, 'npc').setDepth(28))
      this.npcSprite.setScale(2)
      this.npcSprite.setImmovable(true)
      const body = this.npcSprite.body
      if (body && 'setAllowGravity' in body) body.setAllowGravity(false)
      this.solidColliders.push(this.physics.add.collider(this.player, this.npcSprite))

      this.npcLabel = this.trackWorld(this.add.text(npcX - 20, npcY - 26, npc.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#fff5d6',
        backgroundColor: '#1b2d44',
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
      }).setDepth(29))

      this.tweens.add({
        targets: [this.npcSprite, this.npcLabel],
        y: '-=2',
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    this.player.setPosition(10 * TILE + HALF_TILE, WORLD_OFFSET_Y + 6 * TILE + HALF_TILE)
    this.playerShadow?.setPosition(this.player.x, this.player.y + 10)
    this.updateHud()
  }

  private buildIslandTiles(island: Island) {
    this.waterTiles = []

    const cx = MAP_W / 2
    const islandCenterY = WORLD_OFFSET_Y + MAP_PIXEL_HEIGHT / 2
    const totalRows = Math.ceil(GAME_HEIGHT / TILE)

    const biomes: Biome[][] = Array.from({ length: totalRows }, () => Array.from({ length: MAP_W }, () => 'water' as Biome))

    for (let ty = 0; ty < totalRows; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const tileCenterY = ty * TILE + HALF_TILE
        const dx = (tx + 0.5 - cx) / 8
        const dy = ((tileCenterY - islandCenterY) / TILE) / 4.8
        const noise = (this.tileNoise(tx, ty, island.name.length) - 0.5) * 0.16
        const d = Math.sqrt(dx * dx + dy * dy) + noise

        let biome: Biome = 'water'
        if (d < 0.98) biome = 'grass'
        else if (d < 1.24) biome = 'beach'

        biomes[ty][tx] = biome
      }
    }

    const getBiome = (tx: number, ty: number): Biome => {
      if (ty < 0 || ty >= totalRows || tx < 0 || tx >= MAP_W) return 'water'
      return biomes[ty][tx]
    }

    for (let ty = 0; ty < totalRows; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const biome = biomes[ty][tx]

        let key = 'waterTile-0-0'
        if (biome === 'grass') {
          const variant = this.pickVariant(tx, ty, 4, 11)
          key = `grassTile-${variant}`
        } else if (biome === 'beach') {
          const variant = this.pickVariant(tx, ty, 3, 17)
          key = `beachTile-${variant}`
        } else {
          const variant = this.pickVariant(tx, ty, 3, 23)
          key = `waterTile-0-${variant}`
        }

        const tileX = tx * TILE + HALF_TILE
        const tileY = ty * TILE + HALF_TILE
        const tile = this.trackWorld(this.add.image(tileX, tileY, key))
        tile.setDepth(-20)
        this.mapLayer.add(tile)

        if (biome === 'water') {
          const parts = key.split('-')
          const variant = Number(parts[parts.length - 1] ?? '0')
          this.waterTiles.push({ tile, variant })
        }

        const top = getBiome(tx, ty - 1)
        const right = getBiome(tx + 1, ty)
        const bottom = getBiome(tx, ty + 1)
        const left = getBiome(tx - 1, ty)
        const topLeft = getBiome(tx - 1, ty - 1)
        const topRight = getBiome(tx + 1, ty - 1)
        const bottomRight = getBiome(tx + 1, ty + 1)
        const bottomLeft = getBiome(tx - 1, ty + 1)

        const addStrip = (x: number, y: number, w: number, h: number, color: number, alpha: number) => {
          const strip = this.trackWorld(this.add.rectangle(x, y, w, h, color, alpha))
          strip.setDepth(-19)
          this.mapLayer.add(strip)
        }

        const addCorner = (x: number, y: number, radius: number, color: number, alpha: number) => {
          const corner = this.trackWorld(this.add.circle(x, y, radius, color, alpha))
          corner.setDepth(-19)
          this.mapLayer.add(corner)
        }

        const addBlend = (
          targetBiome: Biome,
          color: number,
          edgeSize: number,
          alpha: number,
          cornerAlpha = alpha + 0.06,
        ) => {
          const touchTop = top === targetBiome
          const touchRight = right === targetBiome
          const touchBottom = bottom === targetBiome
          const touchLeft = left === targetBiome

          if (touchTop) addStrip(tileX, tileY - HALF_TILE + edgeSize / 2, TILE, edgeSize, color, alpha)
          if (touchRight) addStrip(tileX + HALF_TILE - edgeSize / 2, tileY, edgeSize, TILE, color, alpha)
          if (touchBottom) addStrip(tileX, tileY + HALF_TILE - edgeSize / 2, TILE, edgeSize, color, alpha)
          if (touchLeft) addStrip(tileX - HALF_TILE + edgeSize / 2, tileY, edgeSize, TILE, color, alpha)

          const cornerRadius = Math.max(2, Math.floor(edgeSize * 0.75))
          if (touchTop && touchLeft) addCorner(tileX - HALF_TILE + edgeSize, tileY - HALF_TILE + edgeSize, cornerRadius, color, cornerAlpha)
          if (touchTop && touchRight) addCorner(tileX + HALF_TILE - edgeSize, tileY - HALF_TILE + edgeSize, cornerRadius, color, cornerAlpha)
          if (touchBottom && touchRight) addCorner(tileX + HALF_TILE - edgeSize, tileY + HALF_TILE - edgeSize, cornerRadius, color, cornerAlpha)
          if (touchBottom && touchLeft) addCorner(tileX - HALF_TILE + edgeSize, tileY + HALF_TILE - edgeSize, cornerRadius, color, cornerAlpha)

          // Fill diagonal pinholes (when only the diagonal neighbor matches).
          const notch = Math.max(2, Math.floor(edgeSize * 0.66))
          if (!touchTop && !touchLeft && topLeft === targetBiome) addStrip(tileX - HALF_TILE + notch / 2, tileY - HALF_TILE + notch / 2, notch, notch, color, cornerAlpha)
          if (!touchTop && !touchRight && topRight === targetBiome) addStrip(tileX + HALF_TILE - notch / 2, tileY - HALF_TILE + notch / 2, notch, notch, color, cornerAlpha)
          if (!touchBottom && !touchRight && bottomRight === targetBiome) addStrip(tileX + HALF_TILE - notch / 2, tileY + HALF_TILE - notch / 2, notch, notch, color, cornerAlpha)
          if (!touchBottom && !touchLeft && bottomLeft === targetBiome) addStrip(tileX - HALF_TILE + notch / 2, tileY + HALF_TILE - notch / 2, notch, notch, color, cornerAlpha)
        }

        if (biome === 'grass') {
          addBlend('beach', island.palette.beach, 6, 0.38)
        }

        if (biome === 'beach') {
          addBlend('water', island.palette.waterFoam, 5, 0.45)
        }
      }
    }
  }

  private clearMapTiles() {
    this.mapLayer.list.forEach((tile) => tile.destroy())
    this.mapLayer.removeAll()
    this.waterTiles = []
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

    if (this.playerShadow) {
      this.playerShadow.setPosition(this.player.x, this.player.y + 10)
      this.playerShadow.setScale(moving ? 1.1 : 1)
    }
  }

  private handleInteract() {
    if (this.tryNpcInteraction()) return
    this.harvestNearbyNode()
  }

  private tryNpcInteraction() {
    if (!this.npcSprite || !this.npcLabel) return false

    const closeEnough = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npcSprite.x, this.npcSprite.y) < 34
    if (!closeEnough) return false

    const npcName = this.npcByIsland[this.islandIndex]?.name ?? 'Scout'

    if (!this.quest.lanternRequested) {
      this.quest.lanternRequested = true
      this.setStatus(`${npcName}: Can you craft a Bug Lantern? Bring it back to me.`)
      this.saveNow()
      return true
    }

    if (!this.quest.lanternDelivered) {
      if (this.crafted.bugLantern > 0) {
        this.crafted.bugLantern -= 1
        this.inventory.fiber += 2
        this.quest.lanternDelivered = true
        this.setStatus(`${npcName}: Amazing! Reward: +2 fiber. Quest complete.`)
        this.updateHud()
        this.saveNow()
        return true
      }

      this.setStatus(`${npcName}: I still need a Bug Lantern.`)
      return true
    }

    const chatter = [
      `${npcName}: Islands feel safer with your lantern around.`,
      `${npcName}: Check other islands for rare materials.`,
      `${npcName}: Your raft kit collection is impressive.`,
    ]
    this.setStatus(Phaser.Utils.Array.GetRandom(chatter))
    return true
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

    const spark = this.trackWorld(this.add.circle(node.sprite.x, node.sprite.y - 8, 4, 0xfff2a2, 0.9).setDepth(40))
    this.tweens.add({
      targets: spark,
      y: spark.y - 16,
      alpha: 0,
      scale: 1.8,
      duration: 260,
      onComplete: () => spark.destroy(),
    })

    this.setStatus(`Collected ${node.type}.`)
    this.updateHud()
    this.saveNow()
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
    this.saveNow()
  }

  private updateHud() {
    const island = this.islands[this.islandIndex]
    const questTag = this.quest.lanternDelivered ? ' | Quest: done' : this.quest.lanternRequested ? ' | Quest: active' : ''
    this.islandLabel.setText(`Island: ${island.name}${questTag}`)

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

  private startWaterAnimation() {
    let frame = 0

    this.time.addEvent({
      delay: 520,
      loop: true,
      callback: () => {
        frame = frame === 0 ? 1 : 0
        this.waterTiles.forEach(({ tile, variant }) => {
          tile.setTexture(`waterTile-${frame}-${variant}`)
        })
      },
    })
  }

  private exposeDebugHooks() {
    if (typeof window === 'undefined') return

    const w = window as any
    w.__ladybugDebug = {
      getState: () => ({
        islandIndex: this.islandIndex,
        islandName: this.islands[this.islandIndex]?.name,
        player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
        inventory: { ...this.inventory },
        crafted: { ...this.crafted },
        selectedRecipe: this.selectedRecipe,
        quest: { ...this.quest },
        cameraZoom: this.cameras.main.zoom,
        fps: Math.round(this.game.loop.actualFps),
      }),
    }
  }

  private loadSave() {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(this.saveKey)
      if (!raw) return

      const parsed = JSON.parse(raw) as Partial<SaveData>
      const savedIsland = typeof parsed.islandIndex === 'number' ? Phaser.Math.Clamp(Math.floor(parsed.islandIndex), 0, this.islands.length - 1) : 0
      this.islandIndex = savedIsland

      if (parsed.inventory) {
        this.inventory.wood = Math.max(0, Number(parsed.inventory.wood ?? 0))
        this.inventory.stone = Math.max(0, Number(parsed.inventory.stone ?? 0))
        this.inventory.fiber = Math.max(0, Number(parsed.inventory.fiber ?? 0))
      }

      if (parsed.crafted) {
        this.crafted.raftKit = Math.max(0, Number(parsed.crafted.raftKit ?? 0))
        this.crafted.bugLantern = Math.max(0, Number(parsed.crafted.bugLantern ?? 0))
      }

      this.selectedRecipe = Phaser.Math.Clamp(Math.floor(Number(parsed.selectedRecipe ?? 0)), 0, this.recipes.length - 1)

      if (parsed.quest) {
        this.quest.lanternRequested = Boolean(parsed.quest.lanternRequested)
        this.quest.lanternDelivered = Boolean(parsed.quest.lanternDelivered)
      }

      if (typeof parsed.cameraZoom === 'number') {
        this.cameras.main.setZoom(Phaser.Math.Clamp(parsed.cameraZoom, 0.75, 2.25))
      }
    } catch {
      // ignore corrupted save
    }
  }

  private saveNow() {
    if (typeof window === 'undefined') return

    const payload: SaveData = {
      islandIndex: this.islandIndex,
      inventory: { ...this.inventory },
      crafted: { ...this.crafted },
      selectedRecipe: this.selectedRecipe,
      quest: { ...this.quest },
      cameraZoom: this.cameras.main.zoom,
    }

    try {
      window.localStorage.setItem(this.saveKey, JSON.stringify(payload))
    } catch {
      // storage might be unavailable
    }
  }

  private isNear(target: Phaser.GameObjects.Rectangle, range: number) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y) <= range
  }

  private trackUi<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiElements.push(obj)
    if ('setScrollFactor' in obj && typeof (obj as any).setScrollFactor === 'function') {
      ;(obj as any).setScrollFactor(0)
    }
    if (this.cameras.main) this.cameras.main.ignore(obj)
    return obj
  }

  private trackWorld<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.worldElements.push(obj)
    if (this.uiCamera) this.uiCamera.ignore(obj)
    return obj
  }

  private setupCameras() {
    this.cameras.main.ignore(this.uiElements)
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.uiCamera.setRoundPixels(true)
    this.uiCamera.ignore(this.worldElements)
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
  fps: {
    target: 60,
    min: 30,
    forceSetTimeOut: false,
  },
  scene: [AdventureScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

new Phaser.Game(config)
