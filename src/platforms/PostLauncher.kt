package subsocial.platforms

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PostLauncher : Module() {
  override fun definition() = ModuleDefinition {
    AsyncFunction("openPost") { url: Uri, packageName: String?, androidUrl: Uri? ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(Intent.ACTION_VIEW, androidUrl ?: url)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

      intent.setPackage(packageName)
      val activity = context.packageManager
        .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY or PackageManager.GET_RESOLVED_FILTER)
        .firstOrNull {
          !it.filter.hasDataScheme("https") || it.filter.countDataAuthorities() > 0
        }?.activityInfo
        ?: return@AsyncFunction false
      intent.setClassName(activity.packageName, activity.name)

      context.startActivity(intent)
      true
    }.runOnQueue(Queues.MAIN)
  }
}
