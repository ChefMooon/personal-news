import { registerRendererModule } from '../registry'
import SportsWidget from './SportsWidget'

registerRendererModule({
  id: 'sports',
  displayName: 'Sports',
  widget: SportsWidget
})

export { SportsWidget }
export { SportsSettingsTab } from './SportsSettingsTab'