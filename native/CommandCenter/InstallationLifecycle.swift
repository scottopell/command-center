import Foundation

// REQ-PK-007/008/014: committed installation state, never a UI action, owns lifetime.
enum InstallationLifecycle {
    enum Effect:Equatable {case unchanged, cancel, relaunch(String)}
    static func effect(for invocation:Invocation?,catalog:FunctionCatalog,supportedEpoch:Int)->Effect {
        guard let invocation=invocation,let launched=invocation.contracts[invocation.mnemonic] else{return .unchanged}
        guard catalog.apiEpoch==supportedEpoch,
              let current=catalog.commands.first(where:{$0.mnemonic==invocation.mnemonic}),
              current.packId==launched.packId,current.id==launched.id,
              current.apiEpoch==supportedEpoch,current.unavailableReason==nil else{return .cancel}
        return current.revision==launched.revision ? .unchanged : .relaunch(invocation.mnemonic)
    }
}

extension Shell {
    func reconcileInstallation() {
        switch InstallationLifecycle.effect(for:active,catalog:catalog,supportedEpoch:SDKRuntime.bundled.manifest.apiEpoch) {
        case .unchanged:break
        case .cancel:cancel()
        case .relaunch(let mnemonic):command.stringValue=mnemonic;execute()
        }
    }
}
