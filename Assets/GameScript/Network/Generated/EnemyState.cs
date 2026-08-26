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
	public partial class EnemyState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public EnemyState() { }
		[Type(0, "string")]
		public string typeId = default(string);

		[Type(1, "float32")]
		public float x = default(float);

		[Type(2, "float32")]
		public float y = default(float);

		[Type(3, "int32")]
		public int hp = default(int);

		[Type(4, "int32")]
		public int maxHp = default(int);

		[Type(5, "boolean")]
		public bool alive = default(bool);
	}
}
