#!/bin/zsh
# Đợt worker song song, mỗi worker một git worktree. Chạy từ repo chính.
#   t-wave.sh new <wave> <name>...      snapshot working tree hiện tại (cả untracked, không đụng index thật), tạo ../<repo>-<wave>-<name>
#   t-wave.sh run <wave> <name> [n]     chép spec .ai/specs/<wave>-<name>.md vào worktree, chạy t-run.sh (MODE=review dùng được)
#   t-wave.sh resume <wave> <name> <n>  t-resume.sh với .ai/specs/<wave>-<name>.answer<n>.txt của repo chính
#   t-wave.sh collect <wave> <name>     chép spec/log/report về, áp thay đổi của worker vào working tree chính (3-way)
#   t-wave.sh rm <wave> <name>          xoá worktree, chỉ khi đã collect và worktree không đổi sau đó
#   t-wave.sh --selftest
# Board chung: .ai/specs/<wave>.board ở repo chính (mỗi run/resume một dòng).
# File gitignored cần trong worktree (docs, scheme, AGENTS.md...): liệt kê trong .ai/wave.copy, mỗi dòng một path.
d=${0:A:h}

snap() {  # tree id của working tree hiện tại (tôn trọng .gitignore), qua index tạm
  local idx=$(mktemp -u) t
  GIT_INDEX_FILE=$idx git read-tree HEAD && GIT_INDEX_FILE=$idx git add -A && t=$(GIT_INDEX_FILE=$idx git write-tree)
  rm -f $idx; [[ -n $t ]] && print $t
}

if [[ $1 == --selftest ]]; then
  set -e; T=$(mktemp -d); trap "rm -rf $T" EXIT; cd $T; mkdir r; cd r
  git init -q; git config user.email t@t; git config user.name t
  print a > a.txt; mkdir -p .ai/specs docs; print spec > .ai/specs/w1-x.md; print docs > docs/d.md
  print '.ai/\ndocs/' > .gitignore; git add a.txt .gitignore; git commit -qm init
  print uncommitted >> a.txt; print new > n.txt; print docs > .ai/wave.copy
  git add a.txt; idx_before=$(git diff --cached --name-only)
  zsh $d/t-wave.sh new w1 x >/dev/null
  [[ $(cat ../r-w1-x/a.txt) == $'a\nuncommitted' && -f ../r-w1-x/n.txt && -f ../r-w1-x/docs/d.md && -f ../r-w1-x/.ai/specs/w1-x.md ]]
  [[ $(git diff --cached --name-only) == $idx_before ]]   # index thật không đổi
  print worker >> ../r-w1-x/a.txt; print made > ../r-w1-x/w.txt
  if zsh $d/t-wave.sh rm w1 x >/dev/null 2>&1; then exit 1; fi   # chưa collect: phải từ chối
  print main-edit >> n.txt
  zsh $d/t-wave.sh collect w1 x >/dev/null
  [[ $(cat a.txt) == $'a\nuncommitted\nworker' && -f w.txt && $(cat n.txt) == $'new\nmain-edit' ]]
  print later >> ../r-w1-x/w.txt
  if zsh $d/t-wave.sh rm w1 x >/dev/null 2>&1; then exit 1; fi   # đổi sau collect: phải từ chối
  zsh $d/t-wave.sh collect w1 x >/dev/null; zsh $d/t-wave.sh rm w1 x >/dev/null
  [[ ! -d ../r-w1-x ]] && ! git rev-parse -q --verify refs/delegate/w1 >/dev/null
  print "selftest OK"; exit 0
fi

main=$(git rev-parse --show-toplevel) || exit 1
cd $main && mkdir -p .ai/specs || exit 1
cmd=$1 wave=$2 w=$3
[[ -n $wave ]] || { sed -n '2,10p' ${0:A}; exit 1; }
wt() { print -r -- "${main:h}/${main:t}-$wave-$1"; }
base=$(git rev-parse -q --verify refs/delegate/$wave)
p=$(wt $w) slug=$wave-$w
board=$main/.ai/specs/$wave.board
need_wt() { [[ -n $base && -d $p ]] || { echo "Không có worktree $p của đợt $wave"; exit 1; }; }

case $cmd in
  new)
    [[ -z $base ]] || { echo "Đợt $wave đã có (refs/delegate/$wave)"; exit 1; }
    (( $# > 2 )) || { echo "Thiếu tên worker"; exit 1; }
    tree=$(snap) || exit 1
    base=$(git commit-tree $tree -p HEAD -m "delegate wave $wave snapshot") || exit 1
    git update-ref refs/delegate/$wave $base   # giữ snapshot khỏi bị gc
    df -h ${main:h} | awk 'NR==2 {print "đĩa trống: " $4}'
    for w in ${@:3}; do
      p=$(wt $w)
      git worktree add -q --detach $p $base || exit 1
      if [[ -f .ai/wave.copy ]]; then
        while IFS= read -r f; do
          [[ -z $f || $f == \#* || ! -e $f ]] && continue
          mkdir -p $p/${f:h}; cp -R $f $p/${f:h}/
        done < .ai/wave.copy
      fi
      mkdir -p $p/.ai/specs
      cp .ai/specs/$wave-$w.md $p/.ai/specs/ 2>/dev/null || echo "($w: chưa có spec .ai/specs/$wave-$w.md; run sẽ chép khi có)"
      print "$w → $p"
    done ;;
  run)
    need_wt; mkdir -p $p/.ai/specs
    cp .ai/specs/$slug.md $p/.ai/specs/ 2>/dev/null
    cd $p && DELEGATE_BOARD=$board zsh $d/t-run.sh $slug ${4:-1} ;;
  resume)
    need_wt; af=$main/.ai/specs/$slug.answer$4.txt
    [[ -f $af ]] || { echo "Thiếu $af"; exit 1; }
    cd $p && DELEGATE_BOARD=$board zsh $d/t-resume.sh $slug $4 $af ;;
  collect)
    need_wt
    for f in $p/.ai/specs/$slug.*(N); do cp $f .ai/specs/; done
    tree=$(cd $p && snap) || exit 1
    # chỉ áp phần đổi từ lần collect trước (worker có thể đã được resume); cùng tree thì không áp lại
    applied=.ai/specs/$slug.applied from=$base
    [[ -f $applied ]] && from=$(cat $applied)
    patch=.ai/specs/$slug.patch
    git diff --binary $from $tree -- . ':(exclude).ai' > $patch
    git diff --stat $from $tree -- . ':(exclude).ai' | tail -1
    print $tree > $applied
    rc=0
    if [[ -s $patch ]]; then
      # index tạm = working tree chính lúc này, để --3way không đòi khớp index thật của người dùng
      idx=$(mktemp -u)
      GIT_INDEX_FILE=$idx git read-tree HEAD && GIT_INDEX_FILE=$idx git add -A && GIT_INDEX_FILE=$idx git apply --3way $patch; rc=$?
      rm -f $idx
    fi
    # shortcut: file gitignored (wave.copy) không nằm trong patch, chỉ liệt kê để gộp tay; nâng cấp nếu đợt nào cũng sửa docs.
    if [[ -f .ai/wave.copy ]]; then
      while IFS= read -r f; do
        [[ -z $f || $f == \#* || ! -e $p/$f ]] && continue
        diff -rq $f $p/$f >/dev/null 2>&1 || echo "gitignored khác nhau, gộp tay nếu cần: $f"
      done < .ai/wave.copy
    fi
    if (( rc )); then echo "CONFLICT: sửa marker trong các file trên, rồi chạy lại collect (không áp lại patch)"; exit $rc; fi
    print $tree > .ai/specs/$slug.collected
    echo "đã gộp $w (patch: $patch)" ;;
  rm)
    need_wt
    [[ -f .ai/specs/$slug.collected ]] || { echo "Chưa collect $w: không xoá (sẽ mất thay đổi)"; exit 1; }
    [[ $(cd $p && snap) == $(cat .ai/specs/$slug.collected) ]] || { echo "$w đổi sau lần collect cuối: collect lại trước"; exit 1; }
    git worktree remove --force $p && echo "đã xoá $p"
    git worktree list --porcelain | grep -q -- "-$wave-" || git update-ref -d refs/delegate/$wave ;;
  *) sed -n '2,10p' ${0:A}; exit 1 ;;
esac
