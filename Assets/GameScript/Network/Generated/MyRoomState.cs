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
	public partial class MyRoomState : Schema {
#if UNITY_5_3_OR_NEWER
[Preserve]
#endif
public MyRoomState() { }
		[Type(0, "string")]
		public string mapId = default(string);

		[Type(1, "string")]
		public string hostSessionId = default(string);

		[Type(2, "uint8")]
		public byte maxPlayers = default(byte);

		[Type(3, "ref", typeof(GameState))]
		public GameState game = null;

		[Type(4, "map", typeof(MapSchema<PlayerState>))]
		public MapSchema<PlayerState> players = null;

		[Type(5, "map", typeof(MapSchema<EnemyState>))]
		public MapSchema<EnemyState> enemies = null;

		[Type(6, "map", typeof(MapSchema<ProjectileState>))]
		public MapSchema<ProjectileState> projectiles = null;
	}
}
