# Light of Mine — Archetypes Specification

> Every system needs exactly ONE working archetype before we build volume.
> This document defines each base pattern. Once an archetype works,
> creating more of its kind is just data (JSON).

---

## Overview

An **archetype** is the first fully-functional example of a pattern.
It proves the system works end-to-end. More instances are just JSON variations.

**Categories:**
1. World Objects (ECS entities)
2. Weapons & Equipment
3. Spells & Magic
4. Enemies
5. NPCs & Dialogue
6. Quests
7. Skills
8. Crafting (Alchemy, Enchanting, Smithing)
9. Interactions & Mechanisms
10. Dungeon Building Blocks

---

## 1. World Objects (ECS Entities)

Every object is an entity with components. Objects share common traits
(anchoring, physics, interactability) composed differently.

### Shared Component: Anchor

All placeable objects need to know HOW they attach to the world:


```
Anchor types:
  floor    — sits on ground (barrel, table, chest)
  wall     — attached to vertical surface (torch, switch, shelf)
  ceiling  — hangs from above (chandelier, chain, stalactite)
  free     — floats/no anchor (projectile, particle, pickup)
```

### 1.1 Archetype: Light Source (wall_torch)

**What it proves:** Anchoring to surfaces, emitting light, toggle interaction.

```json
{
  "id": "wall_torch",
  "name": "Wall Torch",
  "tags": ["light", "interactable", "dungeon", "interior"],
  "components": {
    "renderable": {
      "geometry": "cylinder",
      "size": [0.08, 1.2, 0.08],
      "color": "#5a3a1a",
      "material": "standard"
    },
    "anchor": {
      "type": "wall",
      "face": "auto",
      "offset": 0.05,
      "height": 2.0
    },
    "light": {
      "color": "#ff9944",
      "intensity": 0.8,
      "range": 8,
      "type": "point",
      "flicker": { "speed": 3, "amount": 0.15 }
    },
    "interactable": {
      "type": "toggle",
      "label_on": "Extinguish",
      "label_off": "Light",
      "state": "on",
      "affects": ["light"]
    }
  }
}
```

**Variants derived:** candle (floor), lantern (ceiling/hand), campfire (floor, bigger range)

### 1.2 Archetype: Container (barrel)

**What it proves:** Physics collision, standable surface, container with items, breakable.

```json
{
  "id": "barrel_01",
  "name": "Barrel",
  "tags": ["container", "furniture", "breakable", "interior", "exterior"],
  "components": {
    "renderable": {
      "geometry": "cylinder",
      "size": [0.4, 0.8, 0.4],
      "color": "#6a4a2a"
    },
    "anchor": { "type": "floor" },
    "physics": {
      "collider": "cylinder",
      "radius": 0.4,
      "height": 0.8,
      "mass": 20,
      "static": true,
      "standable": true
    },
    "container": {
      "slots": 4,
      "items": [],
      "locked": false
    },
    "interactable": {
      "type": "container",
      "label": "Search Barrel"
    },
    "health": {
      "max": 30,
      "current": 30,
      "destructible": true,
      "on_destroy": { "drop_contents": true, "particles": "wood_splinter" }
    }
  }
}
```

**Variants:** crate (box collider), sack (no collision, no stand), urn (small), chest (locked)

### 1.3 Archetype: Door/Passage (doorway_stone)

**What it proves:** Passable opening between spaces, visual frame, state (open/closed/locked).

```json
{
  "id": "doorway_stone",
  "name": "Stone Doorway",
  "tags": ["structure", "passage", "dungeon"],
  "components": {
    "renderable": {
      "geometry": "doorframe",
      "size": [1.5, 2.5, 0.4],
      "color": "#5a5a55"
    },
    "anchor": { "type": "wall", "face": "auto" },
    "door": {
      "state": "open",
      "can_lock": true,
      "locked": false,
      "key_id": null,
      "lock_difficulty": 0,
      "target_room": null,
      "exit_position": null
    },
    "physics": {
      "collider": "doorframe",
      "passable_when": "open"
    },
    "interactable": {
      "type": "door",
      "label_open": "Close Door",
      "label_closed": "Open Door",
      "label_locked": "Locked (requires key)"
    }
  }
}
```

**Variants:** wooden_door (closeable), iron_gate (locked, key), portcullis (mechanism-controlled)

### 1.4 Archetype: Furniture (table_wooden)

**What it proves:** Non-interactive physics object, items can be placed ON it.

```json
{
  "id": "table_wooden",
  "name": "Wooden Table",
  "tags": ["furniture", "interior", "surface"],
  "components": {
    "renderable": {
      "geometry": "box",
      "size": [1.2, 0.75, 0.8],
      "color": "#7a5a30"
    },
    "anchor": { "type": "floor" },
    "physics": {
      "collider": "box",
      "static": true,
      "standable": true
    },
    "surface": {
      "height": 0.75,
      "slots": 4,
      "placed_items": []
    }
  }
}
```

**Variants:** chair (no surface), bed (rest interaction), shelf (wall anchor), workbench (crafting station)

### 1.5 Archetype: Mechanism (lever)

**What it proves:** State-changing interaction that affects OTHER entities.

```json
{
  "id": "lever_wall",
  "name": "Wall Lever",
  "tags": ["mechanism", "interactable", "dungeon"],
  "components": {
    "renderable": {
      "geometry": "lever",
      "size": [0.1, 0.5, 0.1],
      "color": "#666666"
    },
    "anchor": { "type": "wall", "height": 1.2 },
    "interactable": {
      "type": "toggle",
      "label_on": "Pull Lever",
      "label_off": "Push Lever",
      "state": "off"
    },
    "mechanism": {
      "targets": ["portcullis_01"],
      "action": "toggle",
      "delay": 0.5,
      "sound": "lever_pull"
    }
  }
}
```

**Variants:** button (momentary), pressure_plate (floor, weight-triggered), tripwire (hidden, one-shot)



---

## 2. Weapons & Equipment

All weapons share: damage, speed, range, durability, element, hand_type.
Equipment shares: slot, armor_value, effects, weight, value.

### 2.1 Archetype: One-Handed Melee (iron_sword)

```json
{
  "id": "iron_sword",
  "name": "Iron Sword",
  "type": "weapon",
  "tags": ["melee", "one_handed", "blade"],
  "properties": {
    "hand_type": "one_handed",
    "damage": 15,
    "speed": 1.0,
    "range": 2.8,
    "durability": 100,
    "max_durability": 100,
    "element": "none",
    "weight": 4,
    "value": 25,
    "skill": "blade",
    "crit_chance": 0.05
  },
  "viewmodel": {
    "geometry": "sword_shape",
    "color": "#c0c8d0",
    "handle_color": "#4a3020"
  }
}
```

**Variants:** dagger (fast, short), axe (slow, high damage), mace (blunt skill)

### 2.2 Archetype: Two-Handed Melee (iron_greatsword)

```json
{
  "id": "iron_greatsword",
  "name": "Iron Greatsword",
  "type": "weapon",
  "properties": {
    "hand_type": "two_handed",
    "damage": 28,
    "speed": 0.6,
    "range": 3.5,
    "durability": 120,
    "element": "none",
    "weight": 8,
    "value": 45,
    "skill": "blade",
    "crit_chance": 0.08
  }
}
```

**Variants:** warhammer (blunt), battle_staff (magic bonus)

### 2.3 Archetype: Ranged Physical (hunting_bow)

```json
{
  "id": "hunting_bow",
  "name": "Hunting Bow",
  "type": "weapon",
  "properties": {
    "hand_type": "two_handed",
    "damage": 12,
    "speed": 0.8,
    "range": 50,
    "durability": 80,
    "element": "none",
    "weight": 3,
    "value": 30,
    "skill": "archery",
    "ammo_type": "arrow",
    "projectile": {
      "speed": 30,
      "gravity": 9.8,
      "trail": null
    }
  }
}
```

**Variants:** crossbow (slower, more damage, no gravity), longbow (faster, more range)

### 2.4 Archetype: Shield (iron_shield)

```json
{
  "id": "iron_shield",
  "name": "Iron Shield",
  "type": "equipment",
  "properties": {
    "slot": "off_hand",
    "armor": 15,
    "block_chance": 0.4,
    "weight": 6,
    "value": 30,
    "durability": 150,
    "skill": "block"
  }
}
```

### 2.5 Archetype: Armor (leather_cuirass)

```json
{
  "id": "leather_cuirass",
  "name": "Leather Cuirass",
  "type": "equipment",
  "properties": {
    "slot": "chest",
    "armor": 10,
    "weight": 5,
    "value": 40,
    "durability": 100,
    "enchantment": null,
    "set_id": null
  }
}
```

**Slots:** head, chest, hands, legs, feet, ring, amulet, off_hand

---

## 3. Spells & Magic

All spells share: school, effect_type, magnitude, duration, cost, range.
Spells are either learned (permanent) or scrolls (single use).

### 3.1 Archetype: Destruction Projectile (fireball)

```json
{
  "id": "spell_fireball",
  "name": "Fireball",
  "school": "destruction",
  "properties": {
    "effect": "damage_fire",
    "magnitude": 25,
    "duration": 0,
    "cost": 15,
    "range": 40,
    "area": 0,
    "element": "fire",
    "status_effect": { "type": "burning", "damage": 3, "duration": 4 },
    "projectile": {
      "speed": 25,
      "gravity": 0,
      "trail": "fire_particles",
      "light": { "color": "#ff4400", "range": 6 }
    }
  },
  "skill": "destruction",
  "level_required": 1
}
```

**Variants:** icicle (ice, slows), lightning_bolt (shock, instant), poison_cloud (area, DoT)

### 3.2 Archetype: Restoration Self (heal)

```json
{
  "id": "spell_heal",
  "name": "Heal",
  "school": "restoration",
  "properties": {
    "effect": "restore_health",
    "magnitude": 30,
    "duration": 0,
    "cost": 20,
    "range": 0,
    "target": "self",
    "element": "holy"
  },
  "skill": "restoration",
  "level_required": 1
}
```

**Variants:** regenerate (HoT), cure_poison, fortify_stamina, ward (damage shield)

### 3.3 Archetype: Alteration Utility (candlelight)

```json
{
  "id": "spell_candlelight",
  "name": "Candlelight",
  "school": "alteration",
  "properties": {
    "effect": "spawn_light",
    "magnitude": 0,
    "duration": 60,
    "cost": 8,
    "range": 0,
    "target": "self",
    "spawns": {
      "type": "light",
      "color": "#ffffcc",
      "range": 12,
      "follows_player": true
    }
  },
  "skill": "alteration",
  "level_required": 1
}
```

**Variants:** waterbreathing, feather (reduce weight), shield (armor boost), telekinesis



---

## 4. Enemies

All enemies share: health, damage, speed, detect_range, attack_range, loot_table, skill_xp_reward.
Behavior determined by AI component (patrol, chase, flee, ranged, etc.)

### 4.1 Archetype: Melee Beast (wolf)

```json
{
  "id": "enemy_wolf_01",
  "name": "Forest Wolf",
  "tags": ["beast", "melee", "pack"],
  "properties": {
    "health": 45,
    "damage": 8,
    "speed": 5,
    "attack_range": 2.0,
    "detect_range": 18,
    "cooldown": 1.2,
    "xp_reward": 20,
    "skill_xp": { "blade": 5 },
    "loot_table": "wolf_loot",
    "element_weakness": "fire",
    "element_resistance": null
  },
  "ai": {
    "behavior": "pack_hunter",
    "flee_health_pct": 0.2,
    "call_allies_range": 15
  },
  "renderable": {
    "geometry": "capsule",
    "size": [0.3, 0.8],
    "color": "#555555"
  }
}
```

**Variants:** crab (slow/weak), spider (fast/fragile), bear (tanky)

### 4.2 Archetype: Ranged Humanoid (skeleton_archer)

```json
{
  "id": "enemy_skeleton_archer",
  "name": "Skeleton Archer",
  "tags": ["undead", "ranged", "humanoid"],
  "properties": {
    "health": 35,
    "damage": 8,
    "speed": 2.5,
    "attack_range": 15,
    "detect_range": 20,
    "cooldown": 2.0,
    "xp_reward": 25,
    "loot_table": "skeleton_loot"
  },
  "ai": {
    "behavior": "ranged_kiter",
    "preferred_distance": 10,
    "flee_if_melee": true,
    "projectile": {
      "id": "arrow_bone",
      "speed": 20,
      "gravity": 5
    }
  }
}
```

**Variants:** mage (spells instead of arrows), bandit_archer

### 4.3 Archetype: Spellcaster (swamp_witch)

```json
{
  "id": "enemy_swamp_witch",
  "name": "Swamp Witch",
  "tags": ["humanoid", "mage", "boss_tier"],
  "properties": {
    "health": 80,
    "damage": 5,
    "speed": 2,
    "attack_range": 20,
    "detect_range": 16,
    "cooldown": 2.5,
    "xp_reward": 50,
    "loot_table": "witch_loot",
    "element_resistance": "poison"
  },
  "ai": {
    "behavior": "spellcaster",
    "spells": ["poison_bolt", "summon_spiders", "heal_self"],
    "spell_rotation": "random",
    "summon_limit": 2,
    "teleport_when_close": true
  }
}
```

**Variants:** necromancer (summon undead), frost_mage, fire_elemental

### 4.4 Archetype: Boss (ancient_guardian)

```json
{
  "id": "enemy_ancient_guardian",
  "name": "Ancient Guardian",
  "tags": ["construct", "boss", "unique"],
  "properties": {
    "health": 300,
    "damage": 20,
    "speed": 2,
    "attack_range": 3.5,
    "detect_range": 25,
    "cooldown": 2.0,
    "xp_reward": 200,
    "loot_table": "boss_guardian_loot"
  },
  "ai": {
    "behavior": "boss",
    "phases": [
      { "health_pct": 1.0, "attacks": ["slam", "sweep"], "speed": 2 },
      { "health_pct": 0.5, "attacks": ["slam", "sweep", "charge"], "speed": 3 },
      { "health_pct": 0.2, "attacks": ["enrage_slam", "shockwave"], "speed": 4 }
    ],
    "immune_to": ["poison"],
    "arena_bounds": { "center": [0,0,0], "radius": 15 }
  }
}
```

---

## 5. NPCs & Dialogue

All NPCs share: name, dialogue file, behavior, schedule, faction, disposition.
NPC archetypes define the ROLE they serve in gameplay.

### 5.1 Archetype: Quest Giver (guard)

Gives quests, provides exposition, has requirements/rewards dialogue paths.

```json
{
  "id": "npc_guard_captain",
  "name": "Captain Aldric",
  "role": "quest_giver",
  "faction": "village_guard",
  "disposition": 50,
  "dialogue": "dialogue/guard_captain.json",
  "schedule": {
    "06:00": { "location": "village_gate", "behavior": "patrol" },
    "18:00": { "location": "village_tavern", "behavior": "idle" },
    "22:00": { "location": "guard_barracks", "behavior": "sleep" }
  },
  "quests_available": ["wolf_hunt", "missing_patrol"],
  "shop": null
}
```

### 5.2 Archetype: Merchant (shopkeeper)

Buys/sells items, has unique stock, restocks over time.

```json
{
  "id": "npc_alchemist",
  "name": "Mirella Greenthumb",
  "role": "merchant",
  "faction": "merchants_guild",
  "shop": {
    "type": "alchemy",
    "stock": [
      { "id": "ingredient_nightshade", "quantity": 3, "price": 8 },
      { "id": "ingredient_mountain_flower", "quantity": 5, "price": 3 },
      { "id": "potion_health_minor", "quantity": 2, "price": 15 },
      { "id": "empty_bottle", "quantity": 10, "price": 2 }
    ],
    "gold": 200,
    "restock_days": 3,
    "buys_types": ["ingredient", "potion"]
  }
}
```

### 5.3 Archetype: Trainer (skill_master)

Teaches skills for gold, has a max level they can train to.

```json
{
  "id": "npc_blade_master",
  "name": "Old Korven",
  "role": "trainer",
  "trains": {
    "skill": "blade",
    "max_level": 50,
    "cost_per_level": 10,
    "dialogue_teach": "I'll sharpen your technique. {cost} gold per lesson.",
    "dialogue_max": "I've taught you everything I know. Seek a master."
  }
}
```

### 5.4 Archetype: Ambient (villager)

Background NPC with simple dialogue, adds life to the world.

```json
{
  "id": "npc_villager_woman_01",
  "name": "Helga",
  "role": "ambient",
  "dialogue": "dialogue/ambient_villager.json",
  "schedule": {
    "08:00": { "location": "market_square", "behavior": "wander" },
    "12:00": { "location": "home", "behavior": "idle" },
    "20:00": { "location": "tavern", "behavior": "sit" }
  },
  "lines": [
    "Beautiful day, isn't it?",
    "Have you been to the market?",
    "I hear strange sounds from the woods at night..."
  ]
}
```



---

## 6. Quests

All quests share: objectives, rewards, giver, turnIn, prerequisite flags.
Quest archetypes define the STRUCTURE of gameplay loops.

### 6.1 Archetype: Kill Quest (bounty)

Simple: kill N of enemy type → return for reward.

### 6.2 Archetype: Fetch Quest (delivery)

Go to location → pick up item → bring back to NPC.

### 6.3 Archetype: Explore Quest (investigation)

Enter a location → discover something → report back. Often chains into kill/fetch.

### 6.4 Archetype: Dialogue Quest (negotiation)

Talk to multiple NPCs in sequence. Choices affect outcome.

### 6.5 Archetype: Escort/Defend (protection)

NPC follows you or stay in area and defend against waves. (Phase 3)

### 6.6 Archetype: Multi-Stage (story quest)

Chains: talk → explore → fight → return → choice → consequence.
Main story quests use this pattern.

```json
{
  "id": "watchtower_mystery",
  "type": "multi_stage",
  "stages": [
    { "id": "accept", "type": "talk", "target": "tavern_keeper" },
    { "id": "explore", "type": "explore", "target": "watchtower_interior" },
    { "id": "fight", "type": "kill", "target": "enemy_skeleton_01", "count": 3 },
    { "id": "return", "type": "talk", "target": "tavern_keeper" }
  ],
  "rewards": { "gold": 75, "items": ["sword_ancient"], "xp": 150 }
}
```

---

## 7. Skills

18 skills, 4 categories. All improve by USE — the more you do it, the better you get.

### Skill Progression Formula
```
XP per use = base_xp × difficulty_multiplier
Level threshold = skill_level × 100
Every 10 skill levels = 1 character level → choose +5 HP, +5 Stamina, or +3 Magicka
```

### 7.1 Combat Skills

| Skill | Improves by | Effect per level |
|-------|-------------|-----------------|
| Blade | Hit with sword/dagger/axe | +1% damage, +0.5% crit |
| Blunt | Hit with mace/hammer | +1% damage, +0.3% stagger |
| Hand-to-Hand | Punch enemies | +1 flat damage, +1% speed |
| Archery | Hit with bow/crossbow | +1% damage, +0.5% accuracy |
| Block | Block incoming attacks | +1% block chance, -0.5% stamina cost |

### 7.2 Magic Skills

| Skill | Improves by | Effect per level |
|-------|-------------|-----------------|
| Destruction | Cast damage spells | -1% magicka cost, +1% damage |
| Restoration | Cast heal/buff spells | -1% cost, +1% magnitude |
| Alteration | Cast utility spells | -1% cost, +2% duration |
| Conjuration | Summon creatures/items | -1% cost, +5% summon HP |

### 7.3 Stealth Skills

| Skill | Improves by | Effect per level |
|-------|-------------|-----------------|
| Sneak | Move undetected near enemies | -1% detection range |
| Lockpick | Pick locks successfully | +1% pick speed, harder locks available |
| Pickpocket | Steal from NPCs | +2% success chance |
| Acrobatics | Jump, fall | +2% jump height, -2% fall damage |

### 7.4 Crafting Skills

| Skill | Improves by | Effect per level |
|-------|-------------|-----------------|
| Alchemy | Create potions | +1 effect revealed per 5 levels, +2% potency |
| Enchanting | Enchant items | +2% charge capacity, stronger effects |
| Smithing | Repair/upgrade at forge | +5% repair amount, can work higher materials |

---

## 8. Crafting Systems

### 8.1 Archetype: Alchemy

**Station:** Alchemy Table (world object, floor anchor, interactable)
**Input:** 2-3 ingredients with overlapping effects
**Output:** Potion or poison

```json
{
  "id": "ingredient_nightshade",
  "name": "Nightshade",
  "type": "ingredient",
  "effects": ["damage_health", "invisibility", "resist_poison", "fortify_sneak"],
  "effects_known": [true, false, false, false],
  "rarity": "uncommon",
  "value": 8,
  "weight": 0.1
}
```

**Rule:** If two ingredients share an effect → potion has that effect.
Higher skill → see more effects before combining (revealed at skill 0/15/30/45).

### 8.2 Archetype: Enchanting

**Station:** Enchanting Altar
**Input:** Weapon/armor + filled soul gem + known spell effect
**Output:** Enchanted item with charges

```json
{
  "id": "soul_gem_lesser",
  "name": "Lesser Soul Gem",
  "capacity": "lesser",
  "filled": false,
  "soul_type": null,
  "charges_value": 0
}
```

**Rule:** Kill creature → soul captured in empty gem → use at altar to apply effect.

### 8.3 Archetype: Smithing

**Station:** Forge + Workbench
**Actions:** Repair (restore durability), Improve (increase damage/armor), Craft (new items from materials)

```json
{
  "recipe": "iron_sword",
  "materials": [
    { "id": "iron_ingot", "quantity": 2 },
    { "id": "leather_strip", "quantity": 1 }
  ],
  "skill_required": 10,
  "output": { "id": "iron_sword", "quality": "standard" }
}
```

---

## 9. Interactions & Mechanisms

Every interaction follows a pattern: detect proximity → show prompt → player input → resolve action → feedback.

### Interaction Types

| Type | Trigger | Result |
|------|---------|--------|
| take | Proximity + E/tap | Item enters inventory |
| open | Proximity + E/tap | Container UI opens |
| talk | Proximity + E/tap | Dialogue starts |
| read | Proximity + E/tap | Text overlay (books/notes) |
| use | Proximity + E/tap | Crafting station / mechanism |
| toggle | Proximity + E/tap | On/off state change |
| steal | Proximity + E/tap (if owned) | Crime check → take |
| lockpick | Proximity + E/tap (if locked) | Minigame → unlock |

### Mechanism Archetype: Linked Events

Mechanisms connect via target IDs:
```
lever_01 → targets: ["gate_01"] → action: toggle
pressure_plate_01 → targets: ["trap_darts_01"] → action: trigger
```

This pattern works for:
- Lever opens gate
- Pressure plate fires darts
- Button lowers bridge
- Key in lock opens door
- All traps

---

## 10. Dungeon Building Blocks

Dungeons are built from **rooms** connected by **passages**.
Each room has a theme, entities, and connection points.

### Room Archetype

```json
{
  "id": "room_guard_post",
  "name": "Guard Post",
  "size": [8, 3, 8],
  "theme": "dungeon_stone",
  "connections": [
    { "wall": "north", "type": "doorway", "position": [0, 0, -4] },
    { "wall": "east", "type": "archway", "position": [4, 0, 0] }
  ],
  "entities": [
    { "prefab": "wall_torch", "anchor": "wall", "wall": "south", "position": [2, 0, 3.8] },
    { "prefab": "wall_torch", "anchor": "wall", "wall": "south", "position": [-2, 0, 3.8] },
    { "prefab": "barrel_01", "position": [3, 0, 3] },
    { "prefab": "table_wooden", "position": [0, 0, 0] },
    { "prefab": "chair_wooden", "position": [1, 0, 0], "rotation": [0, 90, 0] }
  ],
  "spawns": [
    { "type": "enemy", "prefab": "enemy_skeleton_01", "position": [-2, 0, -2] },
    { "type": "enemy", "prefab": "enemy_skeleton_01", "position": [2, 0, -2] }
  ],
  "loot": [
    { "prefab": "chest_wooden", "position": [3, 0, -3], "loot_table": "dungeon_common" }
  ]
}
```

### Connection Types

| Type | Visual | Passable | Notes |
|------|--------|----------|-------|
| doorway | Open arch | Always | Standard passage |
| door | Wooden door | When open | Can lock |
| gate | Iron bars | When raised | Needs lever/key |
| hidden | Wall looks solid | When discovered | Skill check to find |
| collapsed | Rubble | Never (until cleared) | Quest objective |

### Dungeon Generation Pattern (for AI)

```
Input: theme + room_count + difficulty + boss
Output: Array of rooms with connections forming a graph

Rules:
- Start room always has entrance connection
- End room always has boss + final loot
- 30% rooms have enemies, 20% have puzzles, 50% are transitional
- Key items gate progress (key in room A opens door in room C)
- At least one side path with optional loot
```

---

## 11. Summary: What We Need to Build (One Each)

### Minimum Viable Archetypes

| Category | Archetype | Proves |
|----------|-----------|--------|
| Object | Wall torch | Anchoring + light + toggle |
| Object | Barrel | Physics + container + breakable |
| Object | Doorway | Passage + state + locked |
| Object | Table | Surface + non-interactive physics |
| Object | Lever | Mechanism → affects other entity |
| Weapon | Iron Sword | One-handed melee |
| Weapon | Iron Greatsword | Two-handed melee |
| Weapon | Hunting Bow | Ranged physical + ammo |
| Weapon | Iron Shield | Block + off-hand |
| Armor | Leather Cuirass | Equipment slot + armor value |
| Spell | Fireball | Destruction projectile + element |
| Spell | Heal | Restoration self-cast |
| Spell | Candlelight | Alteration utility + duration |
| Enemy | Wolf | Melee beast + pack behavior |
| Enemy | Skeleton Archer | Ranged humanoid |
| Enemy | Swamp Witch | Spellcaster + summons |
| Enemy | Ancient Guardian | Boss + phases |
| NPC | Guard Captain | Quest giver + schedule |
| NPC | Alchemist | Merchant + buy/sell |
| NPC | Blade Master | Trainer |
| NPC | Villager Helga | Ambient + flavor dialogue |
| Quest | Bounty (kill) | Kill N → return → reward |
| Quest | Investigation (explore) | Explore → discover → report |
| Quest | Multi-stage (story) | Chain of objectives |
| Skill | Blade | Use-based combat progression |
| Skill | Alchemy | Crafting progression |
| Skill | Sneak | Stealth progression |
| Crafting | Alchemy Table | Combine ingredients → potion |
| Crafting | Enchanting Altar | Soul gem + effect → enchant |
| Crafting | Forge | Materials → weapon/armor |
| Dungeon | Guard Post room | Room template + entities |
| Dungeon | 3-room mini-dungeon | Connected rooms + boss |

**Total: 31 archetypes.** Once all 31 work, the game has all its patterns.
Everything after is just MORE of each — data, not code.

---

*This document defines WHAT to build. See PRD.md for HOW (architecture).*
*See SCHEMA.md for the JSON FORMAT of each.*
