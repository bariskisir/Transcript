/**
 * Composes the transcript-specific controls and full-space transcript surface.
 */

import ControlBar from './ControlBar'
import TranscriptView from './TranscriptView'
import TranscriptSidebar from '@renderer/components/transcript/TranscriptSidebar'
import { useRecordingActions } from '@renderer/hooks/useRecordingActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useTranscriptHistoryActions } from '@renderer/hooks/useTranscriptHistoryActions'
import styles from './HomePage.module.scss'

/** Renders the primary live transcription workspace. */
const HomePage = (): React.JSX.Element => {
  const recordingActions = useRecordingActions()
  const settingsActions = useSettingsActions()
  const historyActions = useTranscriptHistoryActions()
  return (
    <main className={styles.container}>
      <TranscriptSidebar />
      <section className={styles.workspace}>
        <ControlBar
          captureService={recordingActions.captureService}
          onSettingsChange={settingsActions.saveSettings}
          onStart={recordingActions.startRecording}
          onStop={recordingActions.stopRecording}
        />
        <TranscriptView onExport={historyActions.exportTranscript} />
      </section>
    </main>
  )
}

export default HomePage
