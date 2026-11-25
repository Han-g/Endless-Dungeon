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
	public partial class ProjectileState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public ProjectileState() { }
		[Type(0, "string")]
		public string ownerSessionId = default(string);

		[Type(1, "uint8")]
		public byte projectileTypeId = default(byte);

		[Type(2, "float32")]
		public float x = default(float);

		[Type(3, "float32")]
		public float y = default(float);

		[Type(4, "float32")]
		public float directionX = default(float);

		[Type(5, "float32")]
		public float directionY = default(float);

		[Type(6, "boolean")]
		public bool isHealing = default(bool);
	}
}
