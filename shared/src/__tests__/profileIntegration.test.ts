import { describe, it, expect } from 'vitest'
import { encodeShareString, decodeShareString } from '../profileCodec'
import { DEFAULT_PROFILE, DEFAULT_GLOBAL } from '../presets'
import type { GlobalConfig, Profile } from '../configSchema'

describe('Profile Integration - Full Encode/Decode Round-Trip', () => {
  it('preserves all GlobalConfig fields', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      id: 'test-all-fields',
      name: 'Test All Fields',
    }

    const encoded = await encodeShareString([{ name: 'all', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded).not.toBeNull()
    const decodedProfile = decoded![0].profile
    const decodedGlobal = decodedProfile.global
    const originalGlobal = profile.global

    expect(decodedGlobal.dpsType).toBe(originalGlobal.dpsType)
    expect(decodedGlobal.sortBy).toBe(originalGlobal.sortBy)
    expect(decodedGlobal.maxCombatants).toBe(originalGlobal.maxCombatants)
    expect(decodedGlobal.showHeader).toBe(originalGlobal.showHeader)
    expect(decodedGlobal.transitionDuration).toBe(originalGlobal.transitionDuration)
    expect(decodedGlobal.holdDuration).toBe(originalGlobal.holdDuration)
    expect(decodedGlobal.orientation).toBe(originalGlobal.orientation)
    expect(decodedGlobal.opacity).toBe(originalGlobal.opacity)
    expect(decodedGlobal.outOfCombat).toBe(originalGlobal.outOfCombat)
    expect(decodedGlobal.outOfCombatOpacity).toBe(originalGlobal.outOfCombatOpacity)
    expect(decodedGlobal.valueFormat).toBe(originalGlobal.valueFormat)
    expect(decodedGlobal.combatantFilter).toBe(originalGlobal.combatantFilter)
    expect(decodedGlobal.partyOnly).toBe(originalGlobal.partyOnly)
    expect(decodedGlobal.selfOnly).toBe(originalGlobal.selfOnly)
    expect(decodedGlobal.blurNames).toBe(originalGlobal.blurNames)
    expect(decodedGlobal.mergePets).toBe(originalGlobal.mergePets)
  })

  it('preserves window styling config', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      global: {
        ...DEFAULT_PROFILE.global,
        windowOpacity: 0.9,
        windowBg: '#1a1a2e',
        windowBorder: { enabled: true, color: '#ffffff', width: 2, radius: 8 },
        windowShadow: { enabled: true, color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 0, offsetY: 4 },
      },
    }

    const encoded = await encodeShareString([{ name: 'window', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded![0].profile.global.windowOpacity).toBe(0.9)
    expect(decoded![0].profile.global.windowBorder?.enabled).toBe(true)
    expect(decoded![0].profile.global.windowBorder?.width).toBe(2)
    expect(decoded![0].profile.global.windowShadow?.enabled).toBe(true)
  })

  it('preserves header and footer config', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      global: {
        ...DEFAULT_PROFILE.global,
        header: {
          ...DEFAULT_GLOBAL.header,
          show: true,
          template: '{encounter} - {duration}',
          font: 'Arial',
          size: 14,
          color: '#ff0000',
          background: { type: 'solid', color: '#000000' },
          borderRadius: 6,
          pinned: false,
        },
        footer: {
          ...DEFAULT_GLOBAL.footer,
          show: true,
          template: 'DPS: {totalDPS}',
        },
      },
    }

    const encoded = await encodeShareString([{ name: 'header', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded![0].profile.global.header.template).toBe('{encounter} - {duration}')
    expect(decoded![0].profile.global.header.font).toBe('Arial')
    expect(decoded![0].profile.global.footer.show).toBe(true)
  })

  it('preserves rank indicator config', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      global: {
        ...DEFAULT_PROFILE.global,
        rankIndicator: {
          rank1Enabled: true,
          rank1StyleEnabled: true,
          rank1Style: {
            fill: { type: 'solid', color: '#FFD700' },
            bg: { type: 'solid', color: '#1a1a2e' },
          },
          showNumbers: true,
          rank1HeightIncrease: 5,
          rank1ShowCrown: true,
          rank1Crown: { enabled: true, icon: '👑', imageUrl: '', size: 24, offsetX: 4, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' },
          rank1Glow: { enabled: true, color: '#FFD700', blur: 12 },
        },
      },
    }

    const encoded = await encodeShareString([{ name: 'rank', profile }])
    const decoded = await decodeShareString(encoded)

    const rank = decoded![0].profile.global.rankIndicator
    expect(rank.rank1Enabled).toBe(true)
    expect(rank.showNumbers).toBe(true)
    expect(rank.rank1HeightIncrease).toBe(5)
    expect(rank.rank1ShowCrown).toBe(true)
  })

  it('preserves pets config', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      global: {
        ...DEFAULT_PROFILE.global,
        mergePets: false,
        pets: {
          show: true,
          mergeWithOwner: false,
          petStyle: {},
        },
      },
    }

    const encoded = await encodeShareString([{ name: 'pets', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded![0].profile.global.mergePets).toBe(false)
    expect(decoded![0].profile.global.pets.show).toBe(true)
    expect(decoded![0].profile.global.pets.mergeWithOwner).toBe(false)
  })

  it('preserves tabs config', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      global: {
        ...DEFAULT_PROFILE.global,
        tabsEnabled: true,
        tabs: [
          { id: 'dps', label: 'DPS', filter: { dpsType: 'encdps' } },
          { id: 'hps', label: 'Heals', filter: { dpsType: 'enchps' } },
        ],
        activeTab: 'hps',
        tabsPinned: true,
      },
    }

    const encoded = await encodeShareString([{ name: 'tabs', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded![0].profile.global.tabsEnabled).toBe(true)
    expect(decoded![0].profile.global.tabs?.length).toBe(2)
    expect(decoded![0].profile.global.activeTab).toBe('hps')
  })

  it('preserves style overrides', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      overrides: {
        ...DEFAULT_PROFILE.overrides,
        byRoleEnabled: {
          tank: false,
          healer: true,
          melee: false,
          ranged: false,
          caster: false,
        },
        byJobEnabled: {
          PLD: true,
        },
        selfEnabled: false,
      },
    }

    const encoded = await encodeShareString([{ name: 'overrides', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded![0].profile.overrides.byRoleEnabled?.tank).toBe(false)
    expect(decoded![0].profile.overrides.byJobEnabled?.PLD).toBe(true)
  })

  it('preserves custom icons', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      customIcons: {
        PLD: 'data:image/png;base64,customicon123',
      },
    }

    const encoded = await encodeShareString([{ name: 'icons', profile }])
    const decoded = await decodeShareString(encoded)

    expect(decoded![0].profile.customIcons?.PLD).toBeDefined()
  })
})