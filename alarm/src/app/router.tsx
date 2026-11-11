import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AlarmsPage } from '@/features/alarms'
import { SettingsPage } from '@/features/settings'
import { StopwatchPage } from '@/features/stopwatch'
import { TimerPage } from '@/features/timer'
import { RootLayout } from './RootLayout'

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/alarms' })
  },
})

const alarmsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/alarms', component: AlarmsPage })
const stopwatchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/stopwatch', component: StopwatchPage })
const timerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/timer', component: TimerPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })

const routeTree = rootRoute.addChildren([indexRoute, alarmsRoute, stopwatchRoute, timerRoute, settingsRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: () => <p className="py-20 text-center text-label-2">Page not found.</p>,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
