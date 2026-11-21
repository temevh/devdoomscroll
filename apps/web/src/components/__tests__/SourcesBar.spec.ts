import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SourcesBar from '../SourcesBar.vue'

const SOURCES = [
  { id: 'devto', name: 'dev.to' },
  { id: 'github', name: 'GitHub' },
  { id: 'hackernews', name: 'Hacker News' },
  { id: 'stackoverflow', name: 'Stack Overflow' },
]

const render = (selected: string[] = [], sources = SOURCES) =>
  mount(SourcesBar, { props: { sources, selected } })

const pills = (wrapper: VueWrapper) => wrapper.findAll('button[aria-pressed]')
const pill = (wrapper: VueWrapper, name: string) =>
  pills(wrapper).find((p) => p.text().includes(name))!

describe('SourcesBar', () => {
  describe('rendering', () => {
    it('renders nothing until the sources have loaded', () => {
      expect(render([], []).find('section').exists()).toBe(false)
    })

    it('renders one pill per source, in order', () => {
      expect(pills(render()).map((p) => p.text())).toEqual([
        'dev.to',
        'GitHub',
        'Hacker News',
        'Stack Overflow',
      ])
    })
  })

  describe('logos', () => {
    it.each(SOURCES)('shows the $name logo inside its pill', ({ name }) => {
      const logo = pill(render(), name).find('svg:not([data-testid="check"])')

      expect(logo.exists()).toBe(true)
      expect(logo.find('path').attributes('d')!.length).toBeGreaterThan(50)
      expect(logo.attributes('style')).toMatch(/fill:\s*\S+/)
    })

    it.each(SOURCES)(
      'shows the $name logo in both the selected and unselected state',
      ({ id, name }) => {
        for (const selected of [[], [id]]) {
          const logo = pill(render(selected), name).find('svg:not([data-testid="check"])')

          expect(logo.exists()).toBe(true)
        }
      },
    )

    it.each(SOURCES)(
      'puts the $name logo on a dark tile, so it never depends on the pill colour',
      ({ id, name }) => {
        for (const selected of [[], [id]]) {
          const logo = pill(render(selected), name).find('svg:not([data-testid="check"])')

          expect(logo.element.parentElement!.classList.contains('bg-canvas')).toBe(true)
        }
      },
    )

    it('falls back to the first letter for a source without a logo', () => {
      const wrapper = render([], [{ id: 'mastodon', name: 'Mastodon' }])

      expect(pill(wrapper, 'Mastodon').text()).toBe('MMastodon')
      expect(pill(wrapper, 'Mastodon').find('svg').exists()).toBe(false)
    })
  })

  describe('selected state', () => {
    it('marks only the selected sources as pressed', () => {
      const wrapper = render(['github', 'hackernews'])

      expect(pills(wrapper).map((p) => p.attributes('aria-pressed'))).toEqual([
        'false',
        'true',
        'true',
        'false',
      ])
    })

    it('fills a selected pill solid accent and ticks it', () => {
      const selected = pill(render(['devto']), 'dev.to')

      expect(selected.classes()).toContain('bg-accent')
      expect(selected.find('[data-testid="check"]').exists()).toBe(true)
    })

    it('shows an unselected pill as a dashed outline with no fill and no tick', () => {
      const unselected = pill(render(['devto']), 'GitHub')

      expect(unselected.classes()).toContain('border-dashed')
      expect(unselected.classes()).not.toContain('bg-accent')
      expect(unselected.find('[data-testid="check"]').exists()).toBe(false)
    })

    it('looks different when selected, whatever the mouse is doing', () => {
      const on = pill(render(['devto']), 'dev.to').classes()
      const off = pill(render([]), 'dev.to').classes()

      expect(on).not.toEqual(off)
      // Accent fill and the tick are what say "selected": they are not in the off state at all.
      expect(on).toContain('bg-accent')
      expect(off.some((c) => c.includes('bg-accent'))).toBe(false)
    })

    it('never gives an unselected pill the accent colour on hover, which is reserved for "selected"', () => {
      const off = pill(render([]), 'dev.to').classes()

      expect(off.filter((c) => c.startsWith('hover:') && c.includes('accent'))).toEqual([])
    })
  })

  describe('hint and clear', () => {
    it('says all sources are shown when none are selected, with nothing to clear', () => {
      const wrapper = render([])

      expect(wrapper.text()).toContain('All sources')
      expect(wrapper.text()).not.toContain('Clear all')
    })

    it('offers Clear all instead of the hint once something is selected', () => {
      const wrapper = render(['devto'])

      expect(wrapper.text()).toContain('Clear all')
      expect(wrapper.text()).not.toContain('All sources')
    })
  })

  describe('events', () => {
    it('emits toggle with the source id when a pill is clicked', async () => {
      const wrapper = render()

      await pill(wrapper, 'Hacker News').trigger('click')
      await pill(wrapper, 'dev.to').trigger('click')

      expect(wrapper.emitted('toggle')).toEqual([['hackernews'], ['devto']])
    })

    it('emits clear when Clear all is clicked', async () => {
      const wrapper = render(['devto'])

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Clear all')!
        .trigger('click')

      expect(wrapper.emitted('clear')).toHaveLength(1)
    })
  })
})
