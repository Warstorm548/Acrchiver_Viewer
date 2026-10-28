// Package storage keeps track of the temp space reserved by open archives, so a job is refused
// before it starts when it wouldn't fit (total cap, per-user cap, real free disk space).
package storage

import (
	"errors"
	"sync"
	"syscall"
)

var (
	// ErrArchiveTooLarge: the archive alone is bigger than a cap; retrying won't help.
	ErrArchiveTooLarge = errors.New("archive is larger than the storage cap")
	// ErrUserQuota: the user's own open archives leave no room for this one.
	ErrUserQuota = errors.New("per-user storage cap reached")
	// ErrServerBusy: other users' archives (or a full disk) leave no room right now.
	ErrServerBusy = errors.New("not enough server space right now")
	// ErrOverReservation: more data arrived than was reserved (the hard stop).
	ErrOverReservation = errors.New("more data than reserved")
)

// FreeSpace reports the bytes available to unprivileged users on the file system holding dir.
func FreeSpace(dir string) (int64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dir, &stat); err != nil {
		return 0, err
	}
	return int64(stat.Bavail) * int64(stat.Bsize), nil
}

type Ledger struct {
	mu      sync.Mutex
	total   int64
	perUser int64
	free    func() (int64, error)

	reserved int64
	byUser   map[string]int64
	// unwritten is reserved space not written to disk yet; the disk must still have room for it.
	unwritten int64
}

// NewLedger creates a ledger; free reports the real free disk space (nil skips that check).
func NewLedger(total, perUser int64, free func() (int64, error)) *Ledger {
	return &Ledger{total: total, perUser: perUser, free: free, byUser: map[string]int64{}}
}

type Reservation struct {
	ledger  *Ledger
	user    string
	size    int64
	written int64
	done    bool
}

// Reserve claims size bytes for user, or explains why it can't.
func (l *Ledger) Reserve(user string, size int64) (*Reservation, error) {
	if size < 0 {
		size = 0
	}
	if size > l.total || size > l.perUser {
		return nil, ErrArchiveTooLarge
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.byUser[user]+size > l.perUser {
		return nil, ErrUserQuota
	}
	if l.reserved+size > l.total {
		return nil, ErrServerBusy
	}
	if l.free != nil {
		available, err := l.free()
		if err != nil || available-l.unwritten < size {
			return nil, ErrServerBusy
		}
	}
	l.reserved += size
	l.unwritten += size
	l.byUser[user] += size
	return &Reservation{ledger: l, user: user, size: size}, nil
}

// Write records n bytes written to disk; going past the reservation is refused (the hard stop).
func (r *Reservation) Write(n int64) error {
	l := r.ledger
	l.mu.Lock()
	defer l.mu.Unlock()
	if r.done {
		return ErrOverReservation
	}
	if r.written+n > r.size {
		return ErrOverReservation
	}
	r.written += n
	l.unwritten -= n
	return nil
}

// Release frees the reservation; safe to call more than once.
func (r *Reservation) Release() {
	l := r.ledger
	l.mu.Lock()
	defer l.mu.Unlock()
	if r.done {
		return
	}
	r.done = true
	l.reserved -= r.size
	l.unwritten -= r.size - r.written
	l.byUser[r.user] -= r.size
	if l.byUser[r.user] <= 0 {
		delete(l.byUser, r.user)
	}
}

// Usage returns the bytes reserved in total and by one user.
func (l *Ledger) Usage(user string) (total, byUser int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.reserved, l.byUser[user]
}
