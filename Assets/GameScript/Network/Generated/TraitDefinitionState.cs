//
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
//
// GENERATED USING @colyseus/schema 4.0.31
//

using Colyseus.Schema;
#if UNITY_5_3_OR_NEWER
using UnityEngine.Scripting;
#endif

namespace EndlessDungeon.Network.Generated {
	public partial class TraitDefinitionState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public TraitDefinitionState() { }
		[Type(0, "string")]
		public string id = default(string);

		[Type(1, "string")]
		public string title = default(string);

		[Type(2, "string")]
		public string description = default(string);
	}
}
