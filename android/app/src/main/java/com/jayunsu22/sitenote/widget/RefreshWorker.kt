package com.jayunsu22.sitenote.widget

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/*
 * 백업을 받아 와서 위젯을 다시 그린다.
 * WorkManager 를 쓰는 건 폰이 절전(도즈)에 들어가도 알아서 틈을 봐서 돌려 주고,
 * 재부팅해도 예약이 남아 있어서다. 인터넷이 없을 때는 기다렸다가 돈다.
 */
class RefreshWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        Store.refresh(applicationContext)
        Widgets.updateAll(applicationContext)   // 실패해도 다시 그린다 — '갱신 실패' 를 보여줘야 한다
        // 실패를 retry 로 돌리지 않는다: 키가 틀린 경우엔 몇 번을 다시 해도 똑같고,
        // 통신 문제는 다음 주기(30분)에 어차피 다시 한다
        return Result.success()
    }

    companion object {
        private const val PERIODIC = "sitenote-refresh-periodic"
        private const val NOW = "sitenote-refresh-now"

        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** 30분마다. 이미 걸려 있으면 그대로 둔다 (위젯을 다시 그릴 때마다 주기가 밀리면 안 된다) */
        fun schedule(c: Context) {
            val req = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES)
                .setConstraints(online)
                .build()
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        /** 지금 바로 한 번 — ⟳ 버튼, 앱에서 키를 넣었을 때 */
        fun now(c: Context) {
            val req = OneTimeWorkRequestBuilder<RefreshWorker>().setConstraints(online).build()
            WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
        }

        fun cancel(c: Context) {
            WorkManager.getInstance(c).cancelUniqueWork(PERIODIC)
        }
    }
}
