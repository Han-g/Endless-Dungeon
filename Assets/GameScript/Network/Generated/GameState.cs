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
	public partial class GameState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public GameState() { }
		[Type(0, "string")]
		public string phase = default(string);

		[Type(1, "float32")]
		public float elapsedSeconds = default(float);

		[Type(2, "uint32")]
		public uint killCount = default(uint);

		[Type(3, "int32")]
		public int seed = default(int);
	}
}
