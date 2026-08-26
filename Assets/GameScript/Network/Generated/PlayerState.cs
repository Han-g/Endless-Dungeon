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
	public partial class PlayerState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public PlayerState() { }
		[Type(0, "string")]
		public string name = default(string);

		[Type(1, "uint8")]
		public byte characterId = default(byte);

		[Type(2, "float32")]
		public float x = default(float);

		[Type(3, "float32")]
		public float y = default(float);

		[Type(4, "float32")]
		public float velocityX = default(float);

		[Type(5, "float32")]
		public float velocityY = default(float);

		[Type(6, "int32")]
		public int hp = default(int);

		[Type(7, "int32")]
		public int maxHp = default(int);

		[Type(8, "boolean")]
		public bool alive = default(bool);

		[Type(9, "uint32")]
		public uint lastProcessedInput = default(uint);
	}
}
