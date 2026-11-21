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

		[Type(2, "uint8")]
		public byte level = default(byte);

		[Type(3, "uint32")]
		public uint killCount = default(uint);

		[Type(4, "float32")]
		public float x = default(float);

		[Type(5, "float32")]
		public float y = default(float);

		[Type(6, "float32")]
		public float velocityX = default(float);

		[Type(7, "float32")]
		public float velocityY = default(float);

		[Type(8, "int32")]
		public int hp = default(int);

		[Type(9, "int32")]
		public int maxHp = default(int);

		[Type(10, "boolean")]
		public bool alive = default(bool);

		[Type(11, "uint32")]
		public uint lastProcessedInput = default(uint);

		[Type(12, "boolean")]
		public bool isReady = default(bool);

		[Type(13, "float32")]
		public float moveSpeed = default(float);

		[Type(14, "uint32")]
		public uint experience = default(uint);

		[Type(15, "uint32")]
		public uint nextLevelExperience = default(uint);

		[Type(16, "int32")]
		public int damage = default(int);

		[Type(17, "float32")]
		public float attacksPerSecond = default(float);

		[Type(18, "float32")]
		public float projectileSpeed = default(float);

		[Type(19, "float32")]
		public float projectileRange = default(float);

		[Type(20, "uint32")]
		public uint levelStartExperience = default(uint);

		[Type(21, "uint8")]
		public byte bonusProjectileHits = default(byte);

		[Type(22, "uint32")]
		public uint traitOfferId = default(uint);

		[Type(23, "float64")]
		public double traitDeadline = default(double);

		[Type(24, "string")]
		public string lastTraitId = default(string);

		[Type(25, "map", typeof(MapSchema<uint>), "uint32")]
		public MapSchema<uint> traitRanks = null;
	}
}
