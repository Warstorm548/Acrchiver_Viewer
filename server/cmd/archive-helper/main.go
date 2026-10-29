// archive-helper lists and extracts archives that are too large for the browser, next to
// OpenCloud. See docs/source/archive-helper/ in the Archive Viewer repository.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/api"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/archive"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/config"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/opencloud"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/session"
	"github.com/Warstorm548/Acrchiver_Viewer/server/internal/storage"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if err := run(); err != nil {
		slog.Error("archive-helper stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(nil)
	if err != nil {
		return err
	}
	if warning := config.LoopbackWarning(cfg.Addr); warning != "" {
		slog.Warn(warning)
	}
	// refuse to start rather than half-work: the viewer then stays in browser mode
	if err := session.CheckWritable(cfg.DataDir); err != nil {
		return err
	}
	if removed, err := session.RemoveOrphans(cfg.DataDir); err != nil {
		return err
	} else if removed > 0 {
		slog.Info("removed temp files left by an earlier run", "files", removed)
	}

	ledger := storage.NewLedger(cfg.MaxStorage, cfg.MaxStoragePerUser, func() (int64, error) {
		return storage.FreeSpace(cfg.DataDir)
	})
	manager := session.NewManager(session.Config{
		Dir:         cfg.DataDir,
		Timeout:     cfg.SessionTimeout,
		ScanTimeout: cfg.ScanTimeout,
		Limits:      archive.Limits{MaxEntries: cfg.MaxEntries, MaxScanSize: cfg.MaxScanSize},
	}, ledger, opencloud.NewClient(cfg.OpenCloudURL, &http.Client{Timeout: 0}))

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(cfg, manager).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
		// no write timeout: downloads of several GB take as long as they take
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				manager.Sweep()
			}
		}
	}()

	errs := make(chan error, 1)
	go func() { errs <- server.ListenAndServe() }()
	slog.Info("archive-helper started", "version", api.Version, "addr", cfg.Addr,
		"maxStorage", cfg.MaxStorage, "maxStoragePerUser", cfg.MaxStoragePerUser,
		"maxDownloadSize", cfg.MaxDownloadSize, "maxSelectionSize", cfg.MaxSelectionSize,
		"maxDownloadsPerUser", cfg.MaxDownloadsPerUser, "sessionTimeout", cfg.SessionTimeout)

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	shutdownErr := server.Shutdown(shutdownCtx)
	manager.CloseAll()
	if _, err := session.RemoveOrphans(cfg.DataDir); err != nil {
		slog.Warn("cleanup on shutdown failed", "error", err)
	}
	if errors.Is(shutdownErr, context.DeadlineExceeded) {
		return nil // downloads still running are cut off; their temp files are gone
	}
	return shutdownErr
}
