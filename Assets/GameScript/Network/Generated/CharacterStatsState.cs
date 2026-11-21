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
	public partial class CharacterStatsState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public CharacterStatsState() { }
		[Type(0, "int32")]
		public int maxHp = default(int);

		[Type(1, "float32")]
		public float moveSpeed = default(float);

		[Type(2, "int32")]
		public int damage = default(int);

		[Type(3, "float32")]
		public float attacksPerSecond = default(float);

		[Type(4, "float32")]
		public float projectileSpeed = default(float);

		[Type(5, "float32")]
		public float range = default(float);

		[Type(6, "uint8")]
		public byte maxHitCount = default(byte);

		[Type(7, "uint8")]
		public byte projectileTypeId = default(byte);
	}
}
