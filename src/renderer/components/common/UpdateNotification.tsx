// UpdateNotification.tsx
// React component for handling auto-update notifications

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  LinearProgress,
  Box,
  Snackbar,
  Alert,
  IconButton
} from '@mui/material';
import {
  Download as DownloadIcon,
  Update as UpdateIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  publishedAt?: string;
}

interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export const UpdateNotification: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info');

  useEffect(() => {
    // Set up event listeners for auto-updater events
    const electronAPI = window.electronAPI as any;

    if (electronAPI?.on) {
      // Update checking
      electronAPI.on('update:checking-for-update', () => {
        showSnackbar('Checking for updates...', 'info');
      });

      // Update available
      electronAPI.on('update:available', (info: UpdateInfo) => {
        setUpdateAvailable(info);
        showSnackbar(`Update ${info.version} is available!`, 'info');
      });

      // Update not available
      electronAPI.on('update:not-available', () => {
        showSnackbar('You are using the latest version', 'success');
      });

      // Download progress
      electronAPI.on('update:download-progress', (progress: UpdateProgress) => {
        setDownloadProgress(progress);
        setIsDownloading(true);
      });

      // Update downloaded
      electronAPI.on('update:downloaded', (info: UpdateInfo) => {
        setUpdateDownloaded(info);
        setIsDownloading(false);
        setDownloadProgress(null);
        showSnackbar('Update downloaded! Ready to install.', 'success');
      });

      // Update error
      electronAPI.on('update:error', (error: string) => {
        setIsDownloading(false);
        setDownloadProgress(null);
        showSnackbar(`Update error: ${error}`, 'error');
      });
    }

    // Cleanup listeners on unmount
    return () => {
      if (electronAPI?.removeAllListeners) {
        electronAPI.removeAllListeners('update:checking-for-update');
        electronAPI.removeAllListeners('update:available');
        electronAPI.removeAllListeners('update:not-available');
        electronAPI.removeAllListeners('update:download-progress');
        electronAPI.removeAllListeners('update:downloaded');
        electronAPI.removeAllListeners('update:error');
      }
    };
  }, []);

  const showSnackbar = (message: string, severity: 'success' | 'info' | 'warning' | 'error') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const handleDownloadUpdate = async () => {
    try {
      await window.electronAPI?.updater?.downloadUpdate();
      setUpdateAvailable(null);
    } catch (error) {
      showSnackbar('Failed to start download', 'error');
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await window.electronAPI?.updater?.installUpdate();
    } catch (error) {
      showSnackbar('Failed to install update', 'error');
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      await window.electronAPI?.updater?.checkForUpdates();
    } catch (error) {
      showSnackbar('Failed to check for updates', 'error');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  return (
    <>
      {/* Update Available Dialog */}
      <Dialog
        open={!!updateAvailable}
        onClose={() => setUpdateAvailable(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <UpdateIcon color="primary" />
            Update Available
          </Box>
        </DialogTitle>
        <DialogContent>
          {updateAvailable && (
            <>
              <Typography variant="h6" gutterBottom>
                EntraPulse Lite {updateAvailable.version}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                A new version is available. Would you like to download it now?
              </Typography>
              {updateAvailable.releaseNotes && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Release Notes:
                  </Typography>
                  <Typography variant="body2" component="div">
                    {updateAvailable.releaseNotes}
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateAvailable(null)}>
            Later
          </Button>
          <Button
            onClick={handleDownloadUpdate}
            variant="contained"
            startIcon={<DownloadIcon />}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>

      {/* Download Progress Dialog */}
      <Dialog
        open={isDownloading}
        disableEscapeKeyDown
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Downloading Update</DialogTitle>
        <DialogContent>
          {downloadProgress && (
            <>
              <Typography variant="body2" gutterBottom>
                Downloading EntraPulse Lite update...
              </Typography>
              <Box mt={2} mb={1}>
                <LinearProgress
                  variant="determinate"
                  value={downloadProgress.percent}
                />
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="caption">
                  {Math.round(downloadProgress.percent)}% complete
                </Typography>
                <Typography variant="caption">
                  {formatSpeed(downloadProgress.bytesPerSecond)}
                </Typography>
              </Box>
              <Typography variant="caption" color="textSecondary">
                {formatBytes(downloadProgress.transferred)} of {formatBytes(downloadProgress.total)}
              </Typography>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Update Downloaded Dialog */}
      <Dialog
        open={!!updateDownloaded}
        onClose={() => setUpdateDownloaded(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <CheckCircleIcon color="success" />
            Update Ready
          </Box>
        </DialogTitle>
        <DialogContent>
          {updateDownloaded && (
            <>
              <Typography variant="body1" gutterBottom>
                EntraPulse Lite {updateDownloaded.version} has been downloaded successfully.
              </Typography>
              <Typography variant="body2" color="textSecondary">
                The application will restart to complete the installation. Please save any important work before proceeding.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateDownloaded(null)}>
            Install Later
          </Button>
          <Button
            onClick={handleInstallUpdate}
            variant="contained"
            color="primary"
          >
            Restart & Install
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          variant="filled"
          action={
            snackbarSeverity === 'info' && snackbarMessage.includes('latest version') ? (
              <IconButton
                size="small"
                onClick={handleCheckForUpdates}
                color="inherit"
              >
                <UpdateIcon />
              </IconButton>
            ) : undefined
          }
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default UpdateNotification;
