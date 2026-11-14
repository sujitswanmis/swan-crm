package com.supujacreations.workspace;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.atomic.AtomicBoolean;

/** System-scheduled status-only work. No location permission or location foreground service. */
public final class FieldDeviceStatusJobService extends JobService {
    private AtomicBoolean stopped;

    @Override public boolean onStartJob(JobParameters params) {
        AtomicBoolean thisRun = new AtomicBoolean(false);
        stopped = thisRun;
        FieldDeviceStatusReporter.get(this).reportNow(true, () -> {
            if (!thisRun.get()) jobFinished(params, false);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        if (stopped != null) stopped.set(true);
        return true;
    }
}
