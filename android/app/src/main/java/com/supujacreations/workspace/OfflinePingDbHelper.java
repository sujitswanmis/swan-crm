package com.supujacreations.workspace;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.ArrayList;
import java.util.List;

public class OfflinePingDbHelper extends SQLiteOpenHelper {

    private static final String DB_NAME = "spc_field_tracking.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE_PINGS = "offline_pings";
    private static final int MAX_CACHED_PINGS = 10000;

    public static class QueuedPing {
        public final long id;
        public final String payloadJson;
        public final long recordedAtMs;
        public final boolean isOfflineSynced;

        public QueuedPing(long id, String payloadJson, long recordedAtMs, boolean isOfflineSynced) {
            this.id = id;
            this.payloadJson = payloadJson;
            this.recordedAtMs = recordedAtMs;
            this.isOfflineSynced = isOfflineSynced;
        }
    }

    public OfflinePingDbHelper(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS " + TABLE_PINGS + " (" +
            "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
            "payload_json TEXT NOT NULL, " +
            "recorded_at_ms INTEGER NOT NULL, " +
            "is_offline_synced INTEGER NOT NULL DEFAULT 1" +
            ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_PINGS);
        onCreate(db);
    }

    public synchronized void insertPing(String payloadJson, long recordedAtMs, boolean isOfflineSynced) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put("payload_json", payloadJson);
        values.put("recorded_at_ms", recordedAtMs);
        values.put("is_offline_synced", isOfflineSynced ? 1 : 0);
        db.insert(TABLE_PINGS, null, values);

        // Keep SQLite vault bounded on long multi-day offline runs
        try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + TABLE_PINGS, null)) {
            if (c.moveToFirst() && c.getLong(0) > MAX_CACHED_PINGS) {
                db.execSQL(
                    "DELETE FROM " + TABLE_PINGS + " WHERE id IN (" +
                    "SELECT id FROM " + TABLE_PINGS + " ORDER BY id ASC LIMIT " + (c.getLong(0) - MAX_CACHED_PINGS) + ")"
                );
            }
        } catch (Exception ignored) {}
    }

    public synchronized List<QueuedPing> fetchBatch(int limit) {
        List<QueuedPing> result = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery(
            "SELECT id, payload_json, recorded_at_ms, is_offline_synced FROM " + TABLE_PINGS + " ORDER BY id ASC LIMIT ?",
            new String[]{ String.valueOf(Math.max(1, limit)) }
        )) {
            while (c.moveToNext()) {
                result.add(new QueuedPing(
                    c.getLong(0),
                    c.getString(1),
                    c.getLong(2),
                    c.getInt(3) == 1
                ));
            }
        } catch (Exception ignored) {}
        return result;
    }

    public synchronized void deleteByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (Long id : ids) {
                if (id != null) {
                    db.delete(TABLE_PINGS, "id = ?", new String[]{ String.valueOf(id) });
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public synchronized long getPendingCount() {
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + TABLE_PINGS, null)) {
            if (c.moveToFirst()) return c.getLong(0);
        } catch (Exception ignored) {}
        return 0L;
    }
}
