import ExpoModulesCore
import UIKit

class PostLauncher: Module {
  func definition() -> ModuleDefinition {
    AsyncFunction("openPost") { (url: URL, _: String?, _: URL?) async in
      await UIApplication.shared.open(url, options: [.universalLinksOnly: true])
    }
  }
}
