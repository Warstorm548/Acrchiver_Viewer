package storage

import (
	"errors"
	"sync"
	"testing"
)

const GB = 1_000_000_000

func TestScenarioFromRequirements(t *testing.T) {
	l := NewLedger(50*GB, 25*GB, nil)
	user1, err := l.Reserve("u1", 18*GB)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := l.Reserve("u2", 25*GB); err != nil {
		t.Fatal(err)
	}
	// 43 + 12 > 50: refused, and the running jobs are untouched
	if _, err := l.Reserve("u3", 12*GB); !errors.Is(err, ErrServerBusy) {
		t.Fatalf("want ErrServerBusy, got %v", err)
	}
	user1.Release()
	if _, err := l.Reserve("u3", 12*GB); err != nil {
		t.Fatalf("after release: %v", err)
	}
	if total, _ := l.Usage(""); total != 37*GB {
		t.Errorf("reserved = %d", total)
	}
}

func TestPerUserCap(t *testing.T) {
	l := NewLedger(50*GB, 25*GB, nil)
	if _, err := l.Reserve("u1", 20*GB); err != nil {
		t.Fatal(err)
	}
	if _, err := l.Reserve("u1", 6*GB); !errors.Is(err, ErrUserQuota) {
		t.Fatalf("want ErrUserQuota, got %v", err)
	}
	// another user is not affected
	if _, err := l.Reserve("u2", 6*GB); err != nil {
		t.Fatal(err)
	}
}

func TestArchiveLargerThanACap(t *testing.T) {
	l := NewLedger(50*GB, 25*GB, nil)
	if _, err := l.Reserve("u1", 26*GB); !errors.Is(err, ErrArchiveTooLarge) {
		t.Fatalf("want ErrArchiveTooLarge, got %v", err)
	}
	l = NewLedger(20*GB, 25*GB, nil)
	if _, err := l.Reserve("u1", 21*GB); !errors.Is(err, ErrArchiveTooLarge) {
		t.Fatalf("want ErrArchiveTooLarge, got %v", err)
	}
}

func TestDiskFreeSpaceCountsUnwrittenReservations(t *testing.T) {
	free := int64(30 * GB)
	l := NewLedger(100*GB, 100*GB, func() (int64, error) { return free, nil })
	first, err := l.Reserve("u1", 20*GB)
	if err != nil {
		t.Fatal(err)
	}
	// 30 free, 20 promised but not written yet: 15 more doesn't fit
	if _, err := l.Reserve("u2", 15*GB); !errors.Is(err, ErrServerBusy) {
		t.Fatalf("want ErrServerBusy, got %v", err)
	}
	// once written, the disk itself reports less free space and nothing is promised any more
	if err := first.Write(20 * GB); err != nil {
		t.Fatal(err)
	}
	free = 10 * GB
	if _, err := l.Reserve("u2", 10*GB); err != nil {
		t.Fatal(err)
	}
}

func TestHardStop(t *testing.T) {
	l := NewLedger(50*GB, 25*GB, nil)
	r, _ := l.Reserve("u1", 100)
	if err := r.Write(60); err != nil {
		t.Fatal(err)
	}
	if err := r.Write(41); !errors.Is(err, ErrOverReservation) {
		t.Fatalf("want ErrOverReservation, got %v", err)
	}
	r.Release()
	r.Release() // idempotent
	if total, mine := l.Usage("u1"); total != 0 || mine != 0 {
		t.Errorf("usage after release = %d / %d", total, mine)
	}
	if err := r.Write(1); !errors.Is(err, ErrOverReservation) {
		t.Fatal("writes after release must fail")
	}
}

func TestConcurrentReservationsNeverExceedTheCap(t *testing.T) {
	l := NewLedger(10*GB, 10*GB, nil)
	var wg sync.WaitGroup
	var mu sync.Mutex
	granted := 0
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := l.Reserve("u", GB); err == nil {
				mu.Lock()
				granted++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if granted != 10 {
		t.Errorf("granted %d reservations of 1 GB under a 10 GB cap", granted)
	}
}

func TestFreeSpace(t *testing.T) {
	free, err := FreeSpace(t.TempDir())
	if err != nil || free <= 0 {
		t.Errorf("FreeSpace = %d, %v", free, err)
	}
}
