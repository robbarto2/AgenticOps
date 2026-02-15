import { AppLayout } from './components/layout/AppLayout'
import { ThemeInitializer } from './components/ThemeInitializer'
import { ToastContainer } from './components/layout/Toast'

function App() {
  return (
    <>
      <ThemeInitializer />
      <AppLayout />
      <ToastContainer />
    </>
  )
}

export default App
