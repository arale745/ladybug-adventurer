import './style.css'
import Phaser from 'phaser'

type ResourceType = 'wood' | 'stone' | 'fiber'

type ResourceNode = {
  type: ResourceType
  sprite: Phaser.Physics.Arcade.Sprite
  harvested: boolean
}

type Island = {
  name: string
  ground: number
  beach: number
  resources: Array<{ type: ResourceType; x: number; y: number }>
}

const GAME_WIDTH = 320
const GAME_HEIGHT = 180

class AdventureScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private interactKey!: Phaser.Input.Keyboard.Key
  private travelKey!: Phaser.Input.Keyboard.Key
  private craftKey!: Phaser.Input.Keyboard.Key

  private islandIndex = 0
  private nodes: ResourceNode[] = []

  private inventory: Record<ResourceType, number> = {
    wood: 0,
    stone: 0,
    fiber: 0,
  }

  private crafted = {
    raftKit: 0,
    bugLantern: 0,
  }

  private dock!: Phaser.GameObjects.Rectangle
  private craftBench!: Phaser.GameObjects.Rectangle
  private islandLabel!: Phaser.GameObjects.Text
  private hudText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text

  private readonly islands: Island[] = [
    {
      name: 'Mossy Nest',
      ground: 0x6baf57,
      beach: 0xd9c58c,
      resources: [
        { type: 'wood', x: 80, y: 84 },
        { type: 'wood', x: 150, y: 62 },
        { type: 'fiber', x: 210, y: 110 },
        { type: 'stone', x: 120, y: 128 },
      ],
    },
    {
      name: 'Pebble Ring',
      ground: 0x79c7b0,
      beach: 0xe3d4a6,
      resources: [
        { type: 'stone', x: 92, y: 68 },
        { type: 'stone', x: 190, y: 104 },
        { type: 'wood', x: 140, y: 122 },
        { type: 'fiber', x: 232, y: 80 },
      ],
    },
    {
      name: 'Sunset Atoll',
      ground: 0x91b35e,
      beach: 0xe8d89f,
      resources: [
        { type: 'fiber', x: 102, y: 100 },
        { type: 'fiber', x: 224, y: 98 },
        { type: 'wood', x: 160, y: 72 },
        { type: 'stone', x: 162, y: 128 },
      ],
    },
  ]

  constructor() {
    super('adventure')
  }

  create() {
    this.createTextures()
    this.createMapShell()
    this.createPlayer()
    this.setupInput()
    this.loadIsland(0)

    this.islandLabel = this.add.text(8, 8, '', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#f9f2d7',
    })

    this.hudText = this.add.text(8, 22, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#f9f2d7',
    })

    this.statusText = this.add.text(8, GAME_HEIGHT - 14, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffe39d',
    })

    this.updateHud()
    this.setStatus('Collect resources with E. Travel islands on the dock (SPACE).')
  }

  update() {
    const speed = 60
    let vx = 0
    let vy = 0

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed

    this.player.setVelocity(vx, vy)

    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.harvestNearbyNode()
    }

    if (Phaser.Input.Keyboard.JustDown(this.travelKey) && this.isNear(this.dock, 18)) {
      const next = (this.islandIndex + 1) % this.islands.length
      this.loadIsland(next)
      this.setStatus(`Sailed to ${this.islands[next].name}.`) // tiny fantasy boat magic
    }

    if (Phaser.Input.Keyboard.JustDown(this.craftKey)) {
      this.tryCraft()
    }
  }

  private createTextures() {
    const g = this.make.graphics({ x: 0, y: 0 })

    g.fillStyle(0xd63b3b)
    g.fillRect(0, 0, 12, 12)
    g.fillStyle(0x111111)
    g.fillRect(2, 2, 2, 2)
    g.fillRect(8, 2, 2, 2)
    g.fillRect(5, 6, 2, 2)
    g.fillRect(2, 9, 2, 2)
    g.fillRect(8, 9, 2, 2)
    g.generateTexture('ladybug', 12, 12)
    g.clear()

    g.fillStyle(0x6b4528)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('wood', 10, 10)
    g.clear()

    g.fillStyle(0x9097a3)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('stone', 10, 10)
    g.clear()

    g.fillStyle(0x79b34d)
    g.fillRect(0, 0, 10, 10)
    g.generateTexture('fiber', 10, 10)
    g.destroy()
  }

  private createMapShell() {
    const ocean = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2d5f8d)
    ocean.setDepth(-30)

    const beach = this.add.ellipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, 250, 140, 0xe0cd95)
    beach.setDepth(-20)

    const ground = this.add.ellipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, 210, 104, 0x79b35d)
    ground.setData('kind', 'ground')
    ground.setDepth(-10)

    this.dock = this.add.rectangle(280, 90, 16, 24, 0x8c6a3b)
    this.craftBench = this.add.rectangle(36, 90, 16, 16, 0x59432b)

    this.add.text(24, 102, 'CRAFT (C)', { fontFamily: 'monospace', fontSize: '7px', color: '#fff5d6' })
    this.add.text(264, 104, 'DOCK', { fontFamily: 'monospace', fontSize: '7px', color: '#fff5d6' })

    this.physics.add.existing(this.dock, true)
    this.physics.add.existing(this.craftBench, true)

    this.cameras.main.setBackgroundColor(0x1f3f67)
  }

  private createPlayer() {
    this.player = this.physics.add.sprite(160, 90, 'ladybug')
    this.player.setCollideWorldBounds(true)
    this.player.setSize(8, 8)
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.travelKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.craftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C)
  }

  private loadIsland(index: number) {
    this.islandIndex = index

    for (const node of this.nodes) {
      node.sprite.destroy()
    }
    this.nodes = []

    const island = this.islands[index]

    const ground = this.children.list.find((obj) => obj.getData('kind') === 'ground') as Phaser.GameObjects.Ellipse
    ground.setFillStyle(island.ground)

    const beach = this.children.list.find((obj) => obj instanceof Phaser.GameObjects.Ellipse && obj !== ground) as Phaser.GameObjects.Ellipse
    beach.setFillStyle(island.beach)

    island.resources.forEach((res) => {
      const sprite = this.physics.add.sprite(res.x, res.y, res.type)
      sprite.setImmovable(true)
      sprite.body?.setAllowGravity(false)
      this.nodes.push({ type: res.type, sprite, harvested: false })
    })

    this.player.setPosition(160, 90)
    this.updateHud()
  }

  private harvestNearbyNode() {
    const node = this.nodes.find((n) => !n.harvested && Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y) < 16)

    if (!node) {
      this.setStatus('No resource nearby. Get close and press E.')
      return
    }

    node.harvested = true
    node.sprite.setTint(0x333333)
    node.sprite.disableBody(true, true)
    this.inventory[node.type] += 1

    this.setStatus(`Collected ${node.type}.`) 
    this.updateHud()
  }

  private tryCraft() {
    if (!this.isNear(this.craftBench, 20)) {
      this.setStatus('Stand by the craft bench to craft.')
      return
    }

    if (this.inventory.wood >= 2 && this.inventory.fiber >= 2) {
      this.inventory.wood -= 2
      this.inventory.fiber -= 2
      this.crafted.raftKit += 1
      this.setStatus('Crafted a Raft Kit! (2 wood + 2 fiber)')
      this.updateHud()
      return
    }

    if (this.inventory.wood >= 1 && this.inventory.stone >= 2) {
      this.inventory.wood -= 1
      this.inventory.stone -= 2
      this.crafted.bugLantern += 1
      this.setStatus('Crafted a Bug Lantern! (1 wood + 2 stone)')
      this.updateHud()
      return
    }

    this.setStatus('Not enough materials. Need wood/fiber or wood/stone combos.')
  }

  private isNear(target: Phaser.GameObjects.Rectangle, range: number) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y) <= range
  }

  private updateHud() {
    const island = this.islands[this.islandIndex]
    this.islandLabel.setText(`Island: ${island.name}`)
    this.hudText.setText([
      `Materials  wood:${this.inventory.wood} stone:${this.inventory.stone} fiber:${this.inventory.fiber}`,
      `Crafted    raft-kit:${this.crafted.raftKit} bug-lantern:${this.crafted.bugLantern}`,
      'Move: WASD/Arrows  Harvest: E  Craft: C  Travel: SPACE',
    ])
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
